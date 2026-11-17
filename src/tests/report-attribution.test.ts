/**
 * One attribution for offline replays (REVIEW-29 B-PAY-2).
 *
 * An order created offline on business date 13 is replayed after the 04:00
 * cutoff, so the payment row is written on date 14 while its batch keeps the
 * offline `businessDate`. The Z, the P&L and the loyalty report must all put
 * the sale on date 13.
 */

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { getCounterDaySummary } from '@/lib/services/reporting/counter-report-service';
import { getLoyaltyReport } from '@/lib/services/loyalty-report-service';
import { paymentBusinessDate } from '@/lib/services/reporting/payment-business-date';
import { GET as profitLossGET } from '@/app/api/admin/reports/profit-loss/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    businessDay: { findFirst: jest.fn() },
    payment: { findMany: jest.fn(), aggregate: jest.fn(), count: jest.fn() },
    paymentBatch: { findMany: jest.fn() },
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    orderDiscount: { findMany: jest.fn() },
    orderItem: { groupBy: jest.fn() },
    menuItem: { findMany: jest.fn() },
    promotion: { findMany: jest.fn() },
    loyaltyVisit: { groupBy: jest.fn() },
    customer: { count: jest.fn() },
    securityEvent: { count: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/rbac/auth-service', () => ({
  AuthServiceV2: { validateToken: jest.fn() },
}));

const prismaMock = prisma as unknown as Record<
  string,
  Record<string, jest.Mock>
>;

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const orderId = '550e8400-e29b-41d4-a716-446655440005';
const businessDate13 = new Date('2026-11-13T00:00:00.000Z');
const businessDate14 = new Date('2026-11-14T00:00:00.000Z');

const clock = { timezone: 'Asia/Kuala_Lumpur', closeTime: '04:00' };

// Offline order created 18:00 KL on the 13th, replayed at 09:00 KL on the 14th.
const replayedAt = new Date('2026-11-14T01:00:00.000Z');

const paymentRow = {
  id: 'payment-1',
  orderId,
  paymentMethod: 'cash',
  amount: new Prisma.Decimal('50.00'),
  status: 'PAID',
  receiptNumber: 'R-1',
  createdAt: replayedAt,
  batch: { businessDate: businessDate13 },
  order: {
    orderNumber: 'ORD-1',
    orderType: 'DINE_IN',
    dailySeq: 1,
    table: null,
  },
};

function installCommonMocks() {
  prismaMock.restaurant.findUnique.mockResolvedValue({
    timezone: 'Asia/Kuala_Lumpur',
    businessDayCloseTime: '04:00',
    currency: 'MYR',
    openingFloatDefault: new Prisma.Decimal('0.00'),
    cashDrawerEnabled: true,
  });
  prismaMock.restaurant.findFirst.mockResolvedValue({ id: restaurantId });
  prismaMock.order.findMany.mockResolvedValue([
    {
      id: orderId,
      totalAmount: new Prisma.Decimal('50.00'),
      subtotalAmount: new Prisma.Decimal('50.00'),
      taxAmount: new Prisma.Decimal('0.00'),
      serviceCharge: new Prisma.Decimal('0.00'),
      discountAmount: new Prisma.Decimal('0.00'),
      orderType: 'DINE_IN',
    },
  ]);
  prismaMock.order.count.mockResolvedValue(0);
  prismaMock.order.aggregate.mockResolvedValue({
    _sum: { totalAmount: new Prisma.Decimal('0.00') },
    _count: { id: 0, _all: 0 },
  });
  prismaMock.payment.count.mockResolvedValue(0);
  prismaMock.orderDiscount.findMany.mockResolvedValue([]);
  prismaMock.orderItem.groupBy.mockResolvedValue([]);
  prismaMock.menuItem.findMany.mockResolvedValue([]);
  prismaMock.promotion.findMany.mockResolvedValue([]);
  prismaMock.loyaltyVisit.groupBy.mockResolvedValue([]);
  prismaMock.customer.count.mockResolvedValue(0);
  prismaMock.securityEvent.count.mockResolvedValue(0);
  prismaMock.$queryRaw.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  installCommonMocks();
});

describe('paymentBusinessDate', () => {
  it('uses the batch business date when the payment has a batch', () => {
    expect(
      paymentBusinessDate(
        { createdAt: replayedAt, batch: { businessDate: businessDate13 } },
        clock
      )
    ).toBe('2026-11-13');
  });

  it('falls back to createdAt through the restaurant clock without a batch', () => {
    expect(
      paymentBusinessDate({ createdAt: replayedAt, batch: null }, clock)
    ).toBe('2026-11-14');
  });
});

describe('the Z attributes an offline replay to the offline day', () => {
  it('counts the sale on date 13, not the replay date 14', async () => {
    prismaMock.businessDay.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'day-13'
          ? {
              id: 'day-13',
              restaurantId,
              businessDate: businessDate13,
              status: 'OPEN',
              openedAt: new Date('2026-11-13T20:00:00.000Z'),
              closedAt: null,
              openingFloat: new Prisma.Decimal('0.00'),
            }
          : {
              id: 'day-14',
              restaurantId,
              businessDate: businessDate14,
              status: 'OPEN',
              openedAt: new Date('2026-11-14T20:00:00.000Z'),
              closedAt: null,
              openingFloat: new Prisma.Decimal('0.00'),
            }
      )
    );
    // The database returns the row for both days in this mock; the service's
    // effective-date filter is what must exclude it from date 14.
    prismaMock.payment.findMany.mockResolvedValue([paymentRow]);
    prismaMock.paymentBatch.findMany.mockImplementation(({ where }) => {
      const date = (where.businessDate as Date).toISOString().slice(0, 10);
      return Promise.resolve(
        date === '2026-11-13'
          ? [
              {
                paymentMethod: 'cash',
                cashPayable: new Prisma.Decimal('50.00'),
                cashReceived: new Prisma.Decimal('50.00'),
                changeGiven: new Prisma.Decimal('0.00'),
                roundingAdjustment: new Prisma.Decimal('0.00'),
              },
            ]
          : []
      );
    });

    const day13 = await getCounterDaySummary(restaurantId, 'day-13');
    const day14 = await getCounterDaySummary(restaurantId, 'day-14');

    expect(day13.netSales).toBe('50.00');
    expect(day14.netSales).toBe('0.00');
  });
});

describe('the P&L attributes an offline replay to the offline day', () => {
  function request(startDate: string, endDate: string): NextRequest {
    const url = new URL(
      `http://localhost/api/admin/reports/profit-loss?restaurantId=${restaurantId}&startDate=${startDate}&endDate=${endDate}`
    );
    const req = new NextRequest(url.toString(), { method: 'GET' });
    req.cookies.set('qr_rbac_token', 'valid-token');
    return req;
  }

  it('includes the order on date 13 and excludes it on date 14', async () => {
    (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
      isValid: true,
      user: {
        id: 'owner-1',
        email: 'owner@example.test',
        userType: 'restaurant_owner',
        currentRole: { userType: 'restaurant_owner', restaurantId },
      },
    });

    prismaMock.order.aggregate.mockImplementation(({ where }) => {
      const range = where.payments?.some?.OR?.[0]?.batch?.businessDate;
      const from = (range?.gte as Date | undefined)?.toISOString().slice(0, 10);
      const to = (range?.lte as Date | undefined)?.toISOString().slice(0, 10);
      const includes =
        from !== undefined &&
        to !== undefined &&
        from <= '2026-11-13' &&
        '2026-11-13' <= to;
      return Promise.resolve({
        _sum: includes
          ? {
              subtotalAmount: new Prisma.Decimal('50.00'),
              discountAmount: new Prisma.Decimal('0.00'),
              taxAmount: new Prisma.Decimal('0.00'),
              serviceCharge: new Prisma.Decimal('0.00'),
              totalAmount: new Prisma.Decimal('50.00'),
            }
          : {
              subtotalAmount: new Prisma.Decimal('0.00'),
              discountAmount: new Prisma.Decimal('0.00'),
              taxAmount: new Prisma.Decimal('0.00'),
              serviceCharge: new Prisma.Decimal('0.00'),
              totalAmount: new Prisma.Decimal('0.00'),
            },
      });
    });
    prismaMock.payment.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal('0.00') },
    });

    const day13 = await profitLossGET(request('2026-11-13', '2026-11-13'));
    const day14 = await profitLossGET(request('2026-11-14', '2026-11-14'));
    const json13 = await day13.json();
    const json14 = await day14.json();

    expect(json13.report.revenue.netSales).toBe(50);
    expect(json14.report.revenue.netSales).toBe(0);
  });
});

describe('the loyalty report attributes an offline replay to the offline day', () => {
  it('counts the batch on date 13, not the replay date 14', async () => {
    prismaMock.paymentBatch.findMany.mockImplementation(({ where }) => {
      const from = (where.businessDate.gte as Date).toISOString().slice(0, 10);
      return Promise.resolve(
        from === '2026-11-13'
          ? [
              {
                id: 'batch-1',
                payments: [{ orderId, amount: new Prisma.Decimal('50.00') }],
              },
            ]
          : []
      );
    });
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.order.aggregate.mockResolvedValue({
      _sum: { subtotalAmount: new Prisma.Decimal('50.00') },
    });

    const day13 = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-13',
      to: '2026-11-13',
    });
    const day14 = await getLoyaltyReport({
      restaurantId,
      from: '2026-11-14',
      to: '2026-11-14',
    });

    expect(day13.gross).toBe('50.00');
    expect(day13.net).toBe('50.00');
    expect(day14.gross).toBe('0.00');
    expect(day14.net).toBe('0.00');
  });
});
