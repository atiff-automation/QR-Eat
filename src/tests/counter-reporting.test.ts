import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import {
  assertVarianceReason,
  getCounterBlockerOrders,
  getCounterDayOrders,
  getCounterDaySummary,
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
    payment: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    paymentBatch: { findMany: jest.fn() },
    orderItem: { groupBy: jest.fn() },
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
    (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.payment.count as jest.Mock).mockResolvedValue(0);
    (prisma.paymentBatch.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orderItem.groupBy as jest.Mock).mockResolvedValue([]);
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

  it('shows a rounding total and reconciles the cash drawer identity', async () => {
    (prisma.payment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'payment-1',
        orderId: 'order-1',
        paymentMethod: 'cash',
        amount: new Prisma.Decimal('55.68'),
        status: 'PAID',
        receiptNumber: 'R-1',
        createdAt: new Date('2026-10-28T01:20:00.000Z'),
        order: {
          orderNumber: 'ORD-261028-001',
          orderType: 'DINE_IN',
          dailySeq: 1,
          table: null,
        },
      },
    ]);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      orderRow({ totalAmount: new Prisma.Decimal('55.68') }),
    ]);
    (prisma.order.count as jest.Mock).mockResolvedValue(0);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal('0.00') },
      _count: { id: 0, _all: 0 },
    });
    (prisma.paymentBatch.findMany as jest.Mock).mockResolvedValue([
      {
        paymentMethod: 'cash',
        cashPayable: new Prisma.Decimal('55.70'),
        cashReceived: new Prisma.Decimal('60.00'),
        changeGiven: new Prisma.Decimal('4.30'),
        roundingAdjustment: new Prisma.Decimal('0.02'),
      },
      {
        paymentMethod: 'card',
        cashPayable: null,
        cashReceived: null,
        changeGiven: null,
        roundingAdjustment: null,
      },
    ]);

    const summary = await getCounterDaySummary(restaurantId);

    expect(summary.roundingTotal).toBe('0.02');
    expect(
      summary.paymentMethods.find((method) => method.method === 'cash')
        ?.rounding
    ).toBe('0.02');
    // Opening float 100.00 + cash 55.68 + rounding 0.02.
    expect(summary.cashExpected).toBe('155.70');
    expect(summary.cashReconciliation).toEqual({
      cashPayable: '55.70',
      cashReceived: '60.00',
      changeGiven: '4.30',
      checked: true,
      reconciled: true,
      legacy: false,
    });
    const cash = summary.cashReconciliation;
    expect(
      Number(cash.cashPayable) ===
        Number(cash.cashReceived) - Number(cash.changeGiven)
    ).toBe(true);
  });

  it('keeps a legacy cash batch out of the reconciliation but in expected cash', async () => {
    (prisma.payment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'payment-1',
        orderId: 'order-1',
        paymentMethod: 'cash',
        amount: new Prisma.Decimal('55.68'),
        status: 'PAID',
        receiptNumber: 'R-1',
        createdAt: new Date('2026-10-28T01:20:00.000Z'),
        order: {
          orderNumber: 'ORD-261028-001',
          orderType: 'DINE_IN',
          dailySeq: 1,
          table: null,
        },
      },
    ]);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      orderRow({ totalAmount: new Prisma.Decimal('55.68') }),
    ]);
    (prisma.order.count as jest.Mock).mockResolvedValue(0);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal('0.00') },
      _count: { id: 0, _all: 0 },
    });
    // Legacy batches predate `cashPayable`: they still carry received/change
    // but cannot participate in the payable identity.
    (prisma.paymentBatch.findMany as jest.Mock).mockResolvedValue([
      {
        paymentMethod: 'cash',
        cashPayable: null,
        cashReceived: new Prisma.Decimal('60.00'),
        changeGiven: new Prisma.Decimal('4.30'),
        roundingAdjustment: null,
      },
    ]);

    const summary = await getCounterDaySummary(restaurantId);

    expect(summary.roundingTotal).toBe('0.00');
    expect(summary.cashReconciliation).toEqual({
      cashPayable: '0.00',
      cashReceived: '0.00',
      changeGiven: '0.00',
      checked: false,
      reconciled: false,
      legacy: true,
    });
    // Opening float 100.00 + cash 55.68; no rounding on a legacy batch.
    expect(summary.cashExpected).toBe('155.68');
  });

  it('reports gross sales before tax from the order subtotal', async () => {
    (prisma.payment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'payment-1',
        orderId: 'order-1',
        paymentMethod: 'cash',
        amount: new Prisma.Decimal('115.00'),
        status: 'PAID',
        receiptNumber: 'R-1',
        createdAt: new Date('2026-10-28T01:20:00.000Z'),
        order: {
          orderNumber: 'ORD-261028-001',
          orderType: 'DINE_IN',
          dailySeq: 1,
          table: null,
        },
      },
    ]);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      orderRow({
        totalAmount: new Prisma.Decimal('115.00'),
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('6.00'),
        serviceCharge: new Prisma.Decimal('9.00'),
        discountAmount: new Prisma.Decimal('0.00'),
      }),
    ]);
    (prisma.order.count as jest.Mock).mockResolvedValue(0);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal('0.00') },
      _count: { id: 0, _all: 0 },
    });

    const summary = await getCounterDaySummary(restaurantId);

    // Contract §18.20.8: gross is the pre-tax subtotal, never Σ totalAmount.
    expect(summary.grossSales).toBe('100.00');
    expect(summary.netSales).toBe('115.00');
    expect(summary.tax).toBe('6.00');
    expect(summary.serviceCharge).toBe('9.00');
    expect(summary.discounts).toBe('0.00');
    expect(summary.refunds).toBe('0.00');
    expect(summary.orderCount).toBe(1);
    expect(
      Number(summary.grossSales) -
        Number(summary.discounts) +
        Number(summary.tax) +
        Number(summary.serviceCharge) -
        Number(summary.refunds)
    ).toBeCloseTo(Number(summary.netSales), 2);
  });

  it('excludes non-cash batches from rounding and cash reconciliation', async () => {
    (prisma.payment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'payment-1',
        orderId: 'order-1',
        paymentMethod: 'cash',
        amount: new Prisma.Decimal('20.00'),
        status: 'PAID',
        receiptNumber: 'R-1',
        createdAt: new Date('2026-10-28T01:20:00.000Z'),
        order: {
          orderNumber: 'ORD-261028-001',
          orderType: 'DINE_IN',
          dailySeq: 1,
          table: null,
        },
      },
    ]);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([orderRow()]);
    (prisma.order.count as jest.Mock).mockResolvedValue(0);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal('0.00') },
      _count: { id: 0, _all: 0 },
    });
    // The DB CHECK does not enforce the tender, so a malformed card batch can
    // carry cash figures. They must not enter the cash line.
    (prisma.paymentBatch.findMany as jest.Mock).mockResolvedValue([
      {
        paymentMethod: 'card',
        cashPayable: new Prisma.Decimal('30.00'),
        cashReceived: new Prisma.Decimal('31.00'),
        changeGiven: new Prisma.Decimal('1.00'),
        roundingAdjustment: new Prisma.Decimal('0.05'),
      },
    ]);

    const summary = await getCounterDaySummary(restaurantId);

    expect(summary.roundingTotal).toBe('0.00');
    expect(summary.cashReconciliation).toEqual({
      cashPayable: '0.00',
      cashReceived: '0.00',
      changeGiven: '0.00',
      checked: false,
      reconciled: false,
      legacy: false,
    });
  });

  it('reports a refund on its own day without replaying the original order', async () => {
    (prisma.businessDay.findFirst as jest.Mock).mockResolvedValue({
      ...day,
      businessDate: new Date('2026-10-29T00:00:00.000Z'),
      openedAt: new Date('2026-10-28T20:00:00.000Z'),
    });
    // A full refund of a 115.00 sale made the day before. The refund row keeps
    // the original order id, but no money for that order came in today.
    (prisma.payment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'refund-1',
        orderId: 'order-1',
        paymentMethod: 'cash',
        amount: new Prisma.Decimal('-115.00'),
        status: 'PAID',
        receiptNumber: 'R-2',
        createdAt: new Date('2026-10-29T01:00:00.000Z'),
        order: {
          orderNumber: 'ORD-261028-001',
          orderType: 'DINE_IN',
          dailySeq: 1,
          table: null,
        },
      },
    ]);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      orderRow({
        totalAmount: new Prisma.Decimal('115.00'),
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('10.00'),
        serviceCharge: new Prisma.Decimal('5.00'),
        discountAmount: new Prisma.Decimal('0.00'),
      }),
    ]);
    (prisma.order.count as jest.Mock).mockResolvedValue(0);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal('0.00') },
      _count: { id: 0, _all: 0 },
    });

    const summary = await getCounterDaySummary(restaurantId);

    expect(summary.grossSales).toBe('0.00');
    expect(summary.tax).toBe('0.00');
    expect(summary.serviceCharge).toBe('0.00');
    expect(summary.discounts).toBe('0.00');
    expect(summary.refunds).toBe('115.00');
    expect(summary.netSales).toBe('-115.00');
    expect(summary.orderCount).toBe(0);
    expect(summary.averageCheck).toBe('0.00');
    expect(
      Number(summary.grossSales) -
        Number(summary.discounts) +
        Number(summary.tax) +
        Number(summary.serviceCharge) -
        Number(summary.refunds)
    ).toBeCloseTo(Number(summary.netSales), 2);
  });

  it('requires a reason only when cash variance is non-zero', () => {
    expect(() => assertVarianceReason(0, null)).not.toThrow();
    expect(() => assertVarianceReason(0.001, null)).not.toThrow();
    expect(() => assertVarianceReason(-5, null)).toThrow(/reason is required/i);
    expect(() => assertVarianceReason(-5, '  ')).toThrow(/reason is required/i);
    expect(() => assertVarianceReason(-5, 'Cash payout')).not.toThrow();
  });
});
