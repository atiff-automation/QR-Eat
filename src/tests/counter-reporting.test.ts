import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import {
  assertVarianceReason,
  getCounterBlockerOrders,
  getCounterDayOrders,
} from '@/lib/services/reporting/counter-report-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    businessDay: { findFirst: jest.fn() },
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    payment: { aggregate: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const day = {
  id: 'day-1',
  restaurantId,
  businessDate: new Date('2026-10-28T00:00:00.000Z'),
  status: 'OPEN',
  openedAt: new Date('2026-10-27T20:00:00.000Z'),
  closeStartedAt: null,
  closedAt: null,
  closedBy: null,
  closedByName: null,
  closeNote: null,
  openingFloat: new Prisma.Decimal('100.00'),
  countedCash: null,
  expectedCash: null,
  variance: null,
  zNumber: null,
  closeIdempotencyKey: null,
  snapshot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-261028-001',
    orderType: 'DINE_IN',
    tableId: 'table-1',
    dailySeq: 1,
    status: 'SERVED',
    paymentStatus: 'PAID',
    source: 'COUNTER',
    createdAt: new Date('2026-10-28T01:00:00.000Z'),
    servedAt: new Date('2026-10-28T01:20:00.000Z'),
    totalAmount: new Prisma.Decimal('20.00'),
    subtotalAmount: new Prisma.Decimal('18.00'),
    taxAmount: new Prisma.Decimal('2.00'),
    serviceCharge: new Prisma.Decimal('0.00'),
    discountAmount: new Prisma.Decimal('0.00'),
    table: { tableNumber: '2', tableName: 'Window' },
    items: [
      {
        id: 'item-1',
        quantity: 2,
        unitPrice: new Prisma.Decimal('9.00'),
        totalAmount: new Prisma.Decimal('18.00'),
        specialInstructions: null,
        menuItem: { name: 'Pasta' },
        selectedOptions: [],
      },
    ],
    payments: [
      {
        id: 'payment-1',
        paymentMethod: 'cash',
        amount: new Prisma.Decimal('20.00'),
        status: 'PAID',
        receiptNumber: 'R-1',
        cashReceived: new Prisma.Decimal('20.00'),
        changeGiven: new Prisma.Decimal('0.00'),
        createdAt: new Date('2026-10-28T01:20:00.000Z'),
      },
    ],
    modifications: [],
    ...overrides,
  };
}

describe('counter reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      timezone: 'Asia/Kuala_Lumpur',
      businessDayCloseTime: '04:00',
      currency: 'MYR',
      openingFloatDefault: new Prisma.Decimal('100.00'),
      cashDrawerEnabled: true,
    });
    (prisma.businessDay.findFirst as jest.Mock).mockResolvedValue(day);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([orderRow()]);
    (prisma.order.count as jest.Mock).mockResolvedValue(1);
    (prisma.order.groupBy as jest.Mock).mockResolvedValue([
      {
        status: 'SERVED',
        _count: { _all: 1 },
        _sum: {
          totalAmount: new Prisma.Decimal('20.00'),
          subtotalAmount: new Prisma.Decimal('18.00'),
          taxAmount: new Prisma.Decimal('2.00'),
          serviceCharge: new Prisma.Decimal('0.00'),
          discountAmount: new Prisma.Decimal('0.00'),
        },
      },
    ]);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal('0.00') },
      _count: { _all: 0 },
    });
    (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
      _sum: { amount: new Prisma.Decimal('20.00') },
    });
  });

  it('returns day orders with item and payment details', async () => {
    const page = await getCounterDayOrders(restaurantId, {
      businessDate: '2026-10-28',
      scope: 'all',
    });

    expect(page.orders).toHaveLength(1);
    expect(page.orders[0].items[0]).toMatchObject({
      name: 'Pasta',
      quantity: 2,
      totalAmount: '18.00',
    });
    expect(page.orders[0].payments[0]).toMatchObject({
      method: 'cash',
      amount: '20.00',
      receiptNumber: 'R-1',
    });
    expect(page.totals.paid).toBe('20.00');
    expect(page.totals.gross).toBe('20.00');
  });

  it('applies completed and unpaid scopes at the query level', async () => {
    await getCounterDayOrders(restaurantId, {
      businessDate: '2026-10-28',
      scope: 'unpaid',
    });

    expect(prisma.order.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SERVED',
          paymentStatus: 'PENDING',
        }),
      })
    );
  });

  it('returns blocker orders for open orders', async () => {
    const page = await getCounterBlockerOrders(restaurantId, 'OPEN_ORDERS');

    expect(page.count).toBe(1);
    expect(page.orders[0].orderNumber).toBe('ORD-261028-001');
    expect(prisma.order.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
        }),
      })
    );
  });

  it('requires a reason only when cash variance is non-zero', () => {
    expect(() => assertVarianceReason(0, null)).not.toThrow();
    expect(() => assertVarianceReason(0.001, null)).not.toThrow();
    expect(() => assertVarianceReason(-5, null)).toThrow(/reason is required/i);
    expect(() => assertVarianceReason(-5, '  ')).toThrow(/reason is required/i);
    expect(() => assertVarianceReason(-5, 'Cash payout')).not.toThrow();
  });
});
