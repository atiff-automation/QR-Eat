import Decimal from 'decimal.js';
import { prisma } from '@/lib/database';
import {
  getLoyaltyReport,
  LoyaltyReportValidationError,
} from '@/lib/services/loyalty-report-service';
import { toDbBusinessDate } from '@/lib/time/business-day';

jest.mock('@/lib/database', () => ({ prisma: {} }));

const prismaMock = prisma as unknown as {
  restaurant: { findUnique: jest.Mock };
  paymentBatch: { findMany: jest.Mock };
  payment: { findMany: jest.Mock };
  order: { aggregate: jest.Mock };
  orderDiscount: { findMany: jest.Mock };
  promotion: { findMany: jest.Mock };
  loyaltyVisit: { groupBy: jest.Mock };
  customer: { count: jest.Mock };
  securityEvent: { count: jest.Mock };
};

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

function installDefaultMocks() {
  prismaMock.restaurant = {
    findUnique: jest.fn().mockResolvedValue({
      timezone: 'Asia/Kuala_Lumpur',
      businessDayCloseTime: '04:00',
      currency: 'MYR',
    }),
  };
  prismaMock.paymentBatch = {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'batch-1',
        payments: [{ orderId: 'order-1', amount: new Decimal('50.00') }],
      },
      {
        id: 'batch-2',
        payments: [{ orderId: 'order-2', amount: new Decimal('30.00') }],
      },
    ]),
  };
  // Refund payments are written with no batch; they are read by their own
  // createdAt business date rather than through `PaymentBatch`.
  prismaMock.payment = {
    findMany: jest.fn().mockImplementation(({ where }) => {
      if (where.amount?.gt !== undefined) return Promise.resolve([]);
      return Promise.resolve([{ amount: new Decimal('-5.00'), batchId: null }]);
    }),
  };
  prismaMock.order = {
    aggregate: jest.fn().mockResolvedValue({
      _sum: { subtotalAmount: new Decimal('90.00') },
    }),
  };
  prismaMock.orderDiscount = {
    findMany: jest.fn().mockResolvedValue([
      {
        source: 'PROMOTION',
        amount: new Decimal('10.00'),
        sourceId: 'promo-1',
        promotionSnapshot: { scope: 'ITEM' },
      },
      {
        source: 'PROMOTION',
        amount: new Decimal('5.00'),
        sourceId: 'promo-2',
        promotionSnapshot: { scope: 'ORDER' },
      },
      {
        source: 'LOYALTY_REWARD',
        amount: new Decimal('7.00'),
        sourceId: 'visit-1',
        promotionSnapshot: null,
      },
    ]),
  };
  prismaMock.promotion = { findMany: jest.fn().mockResolvedValue([]) };
  prismaMock.loyaltyVisit = {
    groupBy: jest.fn().mockResolvedValue([
      { customerId: 'customer-1', _count: { _all: 3 } },
      { customerId: 'customer-2', _count: { _all: 1 } },
    ]),
  };
  prismaMock.customer = {
    count: jest.fn().mockImplementation(({ where }) => {
      if (where.status === 'ANONYMIZED') return Promise.resolve(2);
      if (where.status === 'ACTIVE' && where.marketingOptIn) {
        return Promise.resolve(4);
      }
      if (where.status === 'ACTIVE') return Promise.resolve(10);
      if (where.createdAt) return Promise.resolve(3);
      return Promise.resolve(12);
    }),
  };
  prismaMock.securityEvent = {
    count: jest.fn().mockResolvedValue(3),
  };
}

describe('loyalty report service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installDefaultMocks();
  });

  it('uses the §18.20.8 definitions and never subtracts discounts from net', async () => {
    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(report.gross).toBe('90.00');
    expect(report.discounts.total).toBe('22.00');
    expect(report.discounts.bySource).toEqual({
      PROMOTION: '15.00',
      LOYALTY_REWARD: '7.00',
    });
    // net is the payment total: 50 + 30 (sales) - 5 (batchless refund).
    expect(report.net).toBe('75.00');
    expect(report.net).not.toBe('68.00');
    expect(report.refunds).toBe('5.00');
    expect(report.rewards).toEqual({ applied: 1, amount: '7.00' });
    expect(report.refusals).toBe(3);
  });

  it('reads refunds from negative payments by the refund business date', async () => {
    const refundCreatedAt = new Date('2026-11-02T05:00:00.000Z'); // 13:00 KL
    prismaMock.paymentBatch.findMany.mockImplementation(({ where }) => {
      const day = (where.businessDate.gte as Date).toISOString().slice(0, 10);
      return Promise.resolve(
        day === '2026-11-01'
          ? [
              {
                id: 'batch-1',
                payments: [
                  { orderId: 'order-1', amount: new Decimal('50.00') },
                ],
              },
            ]
          : []
      );
    });
    prismaMock.order.aggregate.mockResolvedValue({
      _sum: { subtotalAmount: new Decimal('50.00') },
    });
    prismaMock.payment.findMany.mockImplementation(({ where }) => {
      if (where.amount?.gt !== undefined) return Promise.resolve([]);
      const from = where.createdAt.gte as Date;
      const to = where.createdAt.lt as Date;
      return Promise.resolve(
        refundCreatedAt >= from && refundCreatedAt < to
          ? [{ amount: new Decimal('-5.00'), batchId: null }]
          : []
      );
    });

    const saleDay = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-01',
    });
    expect(saleDay.refunds).toBe('0.00');
    expect(saleDay.net).toBe('50.00');

    const refundDay = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-02',
      to: '2026-11-02',
    });
    expect(refundDay.refunds).toBe('5.00');
    expect(refundDay.net).toBe('-5.00');
  });

  it('counts a refund with no PaymentBatch', async () => {
    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(report.refunds).toBe('5.00');
    const refundCall = prismaMock.payment.findMany.mock.calls.find(
      ([arg]) => arg.where.amount?.lt !== undefined
    );
    expect(refundCall?.[0].where).not.toHaveProperty('batchId');
    expect(refundCall?.[0].where.amount).toEqual({ lt: 0 });
  });

  it('does not add a batch-attached refund to net twice', async () => {
    prismaMock.paymentBatch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        payments: [
          { orderId: 'order-1', amount: new Decimal('50.00') },
          { orderId: 'order-1', amount: new Decimal('-5.00') },
        ],
      },
    ]);
    prismaMock.payment.findMany.mockImplementation(({ where }) => {
      if (where.amount?.gt !== undefined) return Promise.resolve([]);
      return Promise.resolve([
        { amount: new Decimal('-5.00'), batchId: 'batch-1' },
      ]);
    });

    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(report.refunds).toBe('5.00');
    expect(report.net).toBe('45.00'); // 50 - 5, not 50 - 5 - 5
  });

  it('includes a batchless positive payment in gross and net exactly once', async () => {
    prismaMock.paymentBatch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        payments: [{ orderId: 'order-1', amount: new Decimal('50.00') }],
      },
    ]);
    prismaMock.payment.findMany.mockImplementation(({ where }) => {
      if (where.amount?.gt !== undefined) {
        return Promise.resolve([
          { orderId: 'order-2', amount: new Decimal('30.00') },
        ]);
      }
      return Promise.resolve([{ amount: new Decimal('-5.00'), batchId: null }]);
    });
    prismaMock.order.aggregate.mockResolvedValue({
      _sum: { subtotalAmount: new Decimal('80.00') },
    });

    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    // 50 batched + 30 batchless - 5 refund; gross covers both orders once.
    expect(report.gross).toBe('80.00');
    expect(report.net).toBe('75.00');
    expect(report.refunds).toBe('5.00');
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith({
      where: { restaurantId, id: { in: ['order-1', 'order-2'] } },
      _sum: { subtotalAmount: true },
    });
    const positiveCall = prismaMock.payment.findMany.mock.calls.find(
      ([arg]) => arg.where.amount?.gt !== undefined
    );
    expect(positiveCall?.[0].where.batchId).toBeNull();
    expect(positiveCall?.[0].where.status).toBe('PAID');
  });

  it('excludes a batchless PENDING positive payment', async () => {
    prismaMock.paymentBatch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        payments: [{ orderId: 'order-1', amount: new Decimal('50.00') }],
      },
    ]);
    prismaMock.payment.findMany.mockImplementation(({ where }) => {
      if (where.amount?.gt !== undefined) {
        // The query asks for PAID rows only, so the PENDING row is absent.
        return Promise.resolve([]);
      }
      return Promise.resolve([{ amount: new Decimal('-5.00'), batchId: null }]);
    });
    prismaMock.order.aggregate.mockResolvedValue({
      _sum: { subtotalAmount: new Decimal('50.00') },
    });

    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(report.gross).toBe('50.00');
    expect(report.net).toBe('45.00');
    const positiveCall = prismaMock.payment.findMany.mock.calls.find(
      ([arg]) => arg.where.amount?.gt !== undefined
    );
    expect(positiveCall?.[0].where.status).toBe('PAID');
  });

  it('counts an order once when it has batched and batchless positive payments', async () => {
    prismaMock.paymentBatch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        payments: [{ orderId: 'order-1', amount: new Decimal('50.00') }],
      },
    ]);
    prismaMock.payment.findMany.mockImplementation(({ where }) => {
      if (where.amount?.gt !== undefined) {
        return Promise.resolve([
          { orderId: 'order-1', amount: new Decimal('30.00') },
        ]);
      }
      return Promise.resolve([]);
    });
    prismaMock.order.aggregate.mockResolvedValue({
      _sum: { subtotalAmount: new Decimal('50.00') },
    });

    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    // The same order is in both payment sets; the Set deduplicates gross.
    expect(report.gross).toBe('50.00');
    expect(report.net).toBe('80.00');
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith({
      where: { restaurantId, id: { in: ['order-1'] } },
      _sum: { subtotalAmount: true },
    });
  });

  it('counts refusals for the tenant and range only', async () => {
    await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(prismaMock.securityEvent.count).toHaveBeenCalledWith({
      where: {
        restaurantId,
        eventType: 'loyalty_rate_limited',
        createdAt: { gte: expect.any(Date), lte: expect.any(Date) },
      },
    });
  });

  it('groups promotion redemptions by snapshot scope', async () => {
    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(report.promotionRedemptions.total).toBe(2);
    expect(report.promotionRedemptions.byScope).toEqual({
      ORDER: { count: 1, amount: '5.00' },
      CATEGORY: { count: 0, amount: '0.00' },
      ITEM: { count: 1, amount: '10.00' },
    });
  });

  it('counts only resolvable promotion redemptions so total equals the scope sum', async () => {
    prismaMock.orderDiscount.findMany.mockResolvedValue([
      {
        source: 'PROMOTION',
        amount: new Decimal('5.00'),
        sourceId: 'promo-1',
        promotionSnapshot: { scope: 'ORDER' },
      },
      {
        source: 'PROMOTION',
        amount: new Decimal('3.00'),
        sourceId: 'promo-missing',
        promotionSnapshot: null,
      },
    ]);
    prismaMock.promotion.findMany.mockResolvedValue([]);

    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    const scopeCount =
      report.promotionRedemptions.byScope.ORDER.count +
      report.promotionRedemptions.byScope.CATEGORY.count +
      report.promotionRedemptions.byScope.ITEM.count;
    expect(report.promotionRedemptions.total).toBe(1);
    expect(scopeCount).toBe(report.promotionRedemptions.total);
  });

  it('computes visit, member and repeat-rate counts', async () => {
    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(report.visits).toEqual({
      count: 4,
      uniqueMembers: 2,
      repeatMembers: 1,
      repeatRate: '0.5000',
    });
    expect(report.members).toEqual({
      total: 12,
      active: 10,
      anonymized: 2,
      newInRange: 3,
      marketingOptIn: 4,
    });
  });

  it('scopes every query by restaurantId and the business-date range', async () => {
    await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(prismaMock.paymentBatch.findMany).toHaveBeenCalledWith({
      where: {
        restaurantId,
        businessDate: {
          gte: toDbBusinessDate('2026-11-01'),
          lte: toDbBusinessDate('2026-11-30'),
        },
      },
      select: {
        id: true,
        payments: { select: { orderId: true, amount: true } },
      },
    });
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith({
      where: { restaurantId, id: { in: ['order-1', 'order-2'] } },
      _sum: { subtotalAmount: true },
    });
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith({
      where: {
        order: { restaurantId },
        amount: { lt: 0 },
        createdAt: {
          gte: expect.any(Date),
          lt: expect.any(Date),
        },
      },
      select: { amount: true, batchId: true },
    });
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith({
      where: {
        order: { restaurantId },
        amount: { gt: 0 },
        batchId: null,
        status: 'PAID',
        createdAt: {
          gte: expect.any(Date),
          lt: expect.any(Date),
        },
      },
      select: { orderId: true, amount: true },
    });
    expect(prismaMock.orderDiscount.findMany).toHaveBeenCalledWith({
      where: {
        restaurantId,
        orderId: { in: ['order-1', 'order-2'] },
        status: 'ACTIVE',
      },
      select: {
        source: true,
        amount: true,
        sourceId: true,
        promotionSnapshot: true,
      },
    });
    expect(prismaMock.loyaltyVisit.groupBy).toHaveBeenCalledWith({
      by: ['customerId'],
      where: {
        restaurantId,
        businessDate: {
          gte: toDbBusinessDate('2026-11-01'),
          lte: toDbBusinessDate('2026-11-30'),
        },
      },
      _count: { _all: true },
    });
    for (const call of prismaMock.customer.count.mock.calls) {
      expect(call[0].where.restaurantId).toBe(restaurantId);
    }
  });

  it('falls back to the promotion row when a snapshot has no scope', async () => {
    prismaMock.orderDiscount.findMany.mockResolvedValue([
      {
        source: 'PROMOTION',
        amount: new Decimal('4.00'),
        sourceId: 'promo-3',
        promotionSnapshot: null,
      },
    ]);
    prismaMock.promotion.findMany.mockResolvedValue([
      { id: 'promo-3', scope: 'CATEGORY' },
    ]);

    const report = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(report.promotionRedemptions.byScope.CATEGORY).toEqual({
      count: 1,
      amount: '4.00',
    });
  });

  it('rejects a missing or malformed business-date range', async () => {
    await expect(
      getLoyaltyReport({ restaurantId, from: null, to: '2026-11-30' })
    ).rejects.toBeInstanceOf(LoyaltyReportValidationError);

    await expect(
      getLoyaltyReport({
        restaurantId,
        from: '2026-11-30',
        to: '2026-11-01',
      })
    ).rejects.toBeInstanceOf(LoyaltyReportValidationError);

    await expect(
      getLoyaltyReport({
        restaurantId,
        from: '2026-02-30',
        to: '2026-03-01',
      })
    ).rejects.toBeInstanceOf(LoyaltyReportValidationError);
  });
});
