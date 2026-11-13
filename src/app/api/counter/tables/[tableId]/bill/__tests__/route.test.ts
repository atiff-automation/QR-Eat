import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { hashNoticeText } from '@/lib/loyalty/consent';
import { GET as getBill } from '@/app/api/counter/tables/[tableId]/bill/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireTableAccess: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    order: { findMany: jest.fn() },
    diningSession: { findFirst: jest.fn() },
    loyaltySettings: { findUnique: jest.fn() },
    promotion: { findMany: jest.fn() },
    orderDiscount: { findMany: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    customer: { findFirst: jest.fn() },
    loyaltyCard: { findUnique: jest.fn() },
    loyaltyVisit: { findFirst: jest.fn() },
    paymentBatch: { findMany: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';
const customerId = '550e8400-e29b-41d4-a716-446655440004';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: {},
  isAdmin: false,
  roleTemplate: 'restaurant_owner',
  mustChangePassword: false,
};

const table = {
  id: tableId,
  tableNumber: '1',
  tableName: 'Window Table',
  status: 'OCCUPIED',
  restaurantId,
  activeDiningSessionId: sessionId,
  restaurant: {
    currency: 'MYR',
    taxLabel: 'Tax',
    serviceChargeLabel: 'Service Charge',
  },
};

const noticeText = 'Rewards notice text';

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

function order(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'order-1',
    orderNumber: 'ORD-1',
    tableId,
    restaurantId,
    customerSessionId: 'cs-1',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    source: 'COUNTER',
    orderType: 'DINE_IN',
    totalAmount: '5.00',
    subtotalAmount: '5.00',
    taxAmount: '0.00',
    serviceCharge: '0.00',
    taxRateSnapshot: '0.06',
    serviceChargeRateSnapshot: '0.10',
    createdAt: new Date('2026-11-01T12:20:00.000Z'),
    servedAt: null,
    items: [],
    payments: [],
    ...overrides,
  };
}

function request() {
  return new NextRequest(
    `http://localhost/api/counter/tables/${tableId}/bill?version=2`
  );
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    status: 'OPEN',
    openedAt: new Date('2026-11-01T12:00:00.000Z'),
    closedAt: null,
    customerId: null,
    billRevision: 0,
    ...overrides,
  };
}

describe('Counter dine-in bill — loyalty fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LOYALTY_ENABLED;

    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (requireTableAccess as jest.Mock).mockResolvedValue(undefined);
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table);
  });

  afterAll(() => {
    delete process.env.LOYALTY_ENABLED;
  });

  it('is byte-identical to the pre-loyalty response when the flag is off', async () => {
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue(session());
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      order({
        id: 'paid',
        status: 'SERVED',
        paymentStatus: 'PAID',
        totalAmount: '15.00',
        subtotalAmount: '15.00',
        payments: [
          {
            paymentMethod: 'card',
            receiptNumber: 'RCP-1',
            processedAt: new Date('2026-11-01T12:25:00.000Z'),
            completedAt: null,
            createdAt: new Date('2026-11-01T12:25:00.000Z'),
            status: 'PAID',
          },
        ],
      }),
      order({ id: 'unpaid' }),
    ]);

    const response = await getBill(request(), {
      params: Promise.resolve({ tableId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      version: 2,
      session: {
        id: sessionId,
        status: 'OPEN',
        openedAt: '2026-11-01T12:00:00.000Z',
        closedAt: null,
      },
      table: {
        id: tableId,
        tableNumber: '1',
        tableName: 'Window Table',
        status: 'OCCUPIED',
      },
      currency: 'MYR',
      taxLabel: 'Tax',
      serviceChargeLabel: 'Service Charge',
      orders: [
        {
          id: 'paid',
          orderNumber: 'ORD-1',
          tableId,
          restaurantId,
          customerSessionId: 'cs-1',
          status: 'SERVED',
          paymentStatus: 'PAID',
          source: 'COUNTER',
          orderType: 'DINE_IN',
          totalAmount: '15.00',
          subtotalAmount: '15.00',
          taxAmount: '0.00',
          serviceCharge: '0.00',
          taxRateSnapshot: '0.06',
          serviceChargeRateSnapshot: '0.10',
          createdAt: '2026-11-01T12:20:00.000Z',
          servedAt: null,
          items: [],
          payable: false,
          isPending: false,
          paymentMethod: 'card',
          receiptNumber: 'RCP-1',
          paidAt: '2026-11-01T12:25:00.000Z',
        },
        {
          id: 'unpaid',
          orderNumber: 'ORD-1',
          tableId,
          restaurantId,
          customerSessionId: 'cs-1',
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          source: 'COUNTER',
          orderType: 'DINE_IN',
          totalAmount: '5.00',
          subtotalAmount: '5.00',
          taxAmount: '0.00',
          serviceCharge: '0.00',
          taxRateSnapshot: '0.06',
          serviceChargeRateSnapshot: '0.10',
          createdAt: '2026-11-01T12:20:00.000Z',
          servedAt: null,
          items: [],
          payable: true,
          isPending: false,
          paymentMethod: null,
          receiptNumber: null,
          paidAt: null,
        },
      ],
      totals: {
        subtotal: '20.00',
        tax: '0.00',
        serviceCharge: '0.00',
        paid: '15.00',
        unpaid: '5.00',
      },
      counts: {
        open: 1,
        served: 1,
        all: 2,
        unpaid: 1,
        preparing: 0,
        ready: 0,
        pending: 0,
      },
      readyToClear: false,
      blockingOrderCount: 1,
      serverTime: expect.any(String),
    });

    // No loyalty field leaks into the legacy response and no loyalty read runs.
    expect(json).not.toHaveProperty('billRevision');
    expect(json).not.toHaveProperty('member');
    expect(json).not.toHaveProperty('visitState');
    expect(json).not.toHaveProperty('projectedTotal');
    expect(json).not.toHaveProperty('daySubtotal');
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
  });

  it('adds the §18.20.6 fields when loyalty is active', async () => {
    process.env.LOYALTY_ENABLED = 'true';
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue(
      session({ customerId, billRevision: 7 })
    );
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      order({
        id: 'order-1',
        subtotalAmount: '60.00',
        taxAmount: '0.00',
        serviceCharge: '0.00',
        totalAmount: '60.00',
      }),
    ]);
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue(
      settingsRow
    );
    (prisma.promotion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orderDiscount.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      cashRounding: 'NEAREST_5_SEN',
      timezone: 'Asia/Kuala_Lumpur',
      businessDayCloseTime: '04:00',
    });
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(customerRow);
    (prisma.loyaltyCard.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.loyaltyVisit.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.paymentBatch.findMany as jest.Mock).mockResolvedValue([]);

    const response = await getBill(request(), {
      params: Promise.resolve({ tableId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      billRevision: 7,
      member: {
        id: customerId,
        name: 'Aina',
        maskedPhone: '+60•••••••89',
        completedVisits: 0,
        visitsRequired: 3,
      },
      visitState: 'COUNTS',
      promotionApplied: false,
      promotionScope: null,
      promotionItems: [],
      promotionDiscountAmount: '0.00',
      discountAmount: '0.00',
      discountSource: null,
      discountLines: [],
      subtotal: '60.00',
      taxAmount: '3.60',
      serviceCharge: '6.00',
      fullPriceTotal: '69.60',
      projectedRewardAmount: '0.00',
      projectedTotal: '69.60',
      preRewardTotal: '69.60',
      totalAmount: '69.60',
      cashPayable: '69.60',
      daySubtotal: '60.00',
      minDailySpend: '20.00',
      amountToMinimum: '0.00',
    });
    expect(JSON.stringify(json)).not.toContain('+60123456789');
    expect(json).not.toHaveProperty('phoneHash');
  });
});
