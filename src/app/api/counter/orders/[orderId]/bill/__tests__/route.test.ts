import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { counterAccessDenied } from '@/lib/counter/access';
import { hashNoticeText } from '@/lib/loyalty/consent';
import { GET as getOrderBill } from '@/app/api/counter/orders/[orderId]/bill/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findFirst: jest.fn() },
    loyaltySettings: { findUnique: jest.fn() },
    promotion: { findMany: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    customer: { findFirst: jest.fn() },
    loyaltyCard: { findUnique: jest.fn() },
    loyaltyVisit: { findFirst: jest.fn() },
    paymentBatch: { findMany: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const orderId = '550e8400-e29b-41d4-a716-446655440005';
const customerId = '550e8400-e29b-41d4-a716-446655440004';
const noticeText = 'Rewards notice text';

const context = {
  userId: 'user-1',
  userType: 'staff',
  roleTemplate: 'cashier',
  email: 'cashier@example.test',
  restaurantId,
  permissions: {},
  isAdmin: false,
  mustChangePassword: false,
};

const settingsRow = {
  enabled: true,
  visitsRequired: 3,
  rewardType: 'PERCENT',
  rewardValue: new Prisma.Decimal('10.00'),
  maxDiscount: new Prisma.Decimal('15.00'),
  minDailySpend: new Prisma.Decimal('20.00'),
  rewardLabel: '10% off, max RM15',
  noticeVersion: 'v1',
  noticeText,
  noticeTextHash: hashNoticeText(noticeText),
  privacyUrl: 'https://example.test/privacy',
  termsText: null,
};

const customerRow = {
  id: customerId,
  name: 'Aina',
  phone: '+60123456789',
  consentAt: new Date('2026-11-01T00:00:00.000Z'),
  consentWithdrawnAt: null,
  status: 'ACTIVE',
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    orderNumber: 'ORD-TAKE-1',
    orderType: 'TAKEAWAY',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    subtotalAmount: '60.00',
    taxAmount: '3.60',
    serviceCharge: '0.00',
    discountAmount: '0.00',
    totalAmount: '63.60',
    taxRateSnapshot: '0.06',
    serviceChargeRateSnapshot: '0.00',
    discountVersion: 3,
    customerId,
    diningSessionId: null,
    createdAt: new Date('2026-11-13T10:00:00.000Z'),
    servedAt: null,
    items: [
      {
        menuItemId: 'item-1',
        totalAmount: '60.00',
        menuItem: { name: 'Pasta', categoryId: 'cat-1' },
      },
    ],
    restaurant: {
      currency: 'MYR',
      taxLabel: 'Tax',
      serviceChargeLabel: 'Service Charge',
    },
    ...overrides,
  };
}

function request() {
  return new NextRequest(`http://localhost/api/counter/orders/${orderId}/bill`);
}

describe('Counter takeaway order bill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LOYALTY_ENABLED;

    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(order());
  });

  afterAll(() => {
    delete process.env.LOYALTY_ENABLED;
  });

  it('returns 404 for an order outside the tenant', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await getOrderBill(request(), {
      params: Promise.resolve({ orderId }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: orderId, restaurantId } })
    );
  });

  it('returns 400 for a non-takeaway order', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(
      order({ orderType: 'DINE_IN' })
    );

    const response = await getOrderBill(request(), {
      params: Promise.resolve({ orderId }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      code: 'INVALID_ORDER_TYPE',
    });
  });

  it('omits loyalty fields when the flag is off', async () => {
    const response = await getOrderBill(request(), {
      params: Promise.resolve({ orderId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      order: {
        id: orderId,
        orderNumber: 'ORD-TAKE-1',
        orderType: 'TAKEAWAY',
        subtotalAmount: '60.00',
        taxAmount: '3.60',
        serviceCharge: '0.00',
        totalAmount: '63.60',
      },
      currency: 'MYR',
    });
    expect(json).not.toHaveProperty('billRevision');
    expect(json).not.toHaveProperty('member');
    expect(json).not.toHaveProperty('visitState');
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
  });

  it('returns the same bill fields with billRevision = Order.discountVersion', async () => {
    process.env.LOYALTY_ENABLED = 'true';
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue(
      settingsRow
    );
    (prisma.promotion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      cashRounding: 'NONE',
      timezone: 'Asia/Kuala_Lumpur',
      businessDayCloseTime: '04:00',
    });
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(customerRow);
    (prisma.loyaltyCard.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.loyaltyVisit.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.paymentBatch.findMany as jest.Mock).mockResolvedValue([]);

    const response = await getOrderBill(request(), {
      params: Promise.resolve({ orderId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      billRevision: 3,
      member: {
        id: customerId,
        maskedPhone: '+60•••••••89',
        completedVisits: 0,
        visitsRequired: 3,
      },
      visitState: 'COUNTS',
      subtotal: '60.00',
      taxAmount: '3.60',
      serviceCharge: '0.00',
      fullPriceTotal: '63.60',
      projectedRewardAmount: '0.00',
      projectedTotal: '63.60',
      preRewardTotal: '63.60',
      totalAmount: '63.60',
      cashPayable: '63.60',
      daySubtotal: '60.00',
      minDailySpend: '20.00',
      amountToMinimum: '0.00',
    });
    expect(JSON.stringify(json)).not.toContain('+60123456789');
  });
});
