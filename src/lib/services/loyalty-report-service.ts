/**
 * Loyalty report aggregation (§18.20.7, §18.20.8).
 *
 * Definitions are fixed by the contract:
 *
 * - `gross = Σ Order.subtotalAmount` for the orders paid in the range;
 * - `discounts = Σ ACTIVE OrderDiscount.amount`, split by source;
 * - `net = Σ Payment.amount` (the contract also permits `Σ Order.totalAmount`);
 * - `refunds = −Σ negative Payment.amount` reported as a positive magnitude,
 *   attributed to the business date on which the refund payment was created.
 *
 * A discount is **never** subtracted from a net figure: `net` comes from the
 * payment/order total, not from `gross − discounts`.
 *
 * The range is a business-date range, converted with the shared
 * `business-day.ts` helper and the restaurant's timezone/close time. Every
 * query is scoped by `restaurantId`.
 */

import Decimal from 'decimal.js';
import { prisma } from '@/lib/database';
import { RATE_LIMITED_EVENT } from '@/lib/loyalty/enumeration';
import {
  getBusinessDayEnd,
  getBusinessDayStart,
  toDbBusinessDate,
  type BusinessDate,
} from '@/lib/time/business-day';
import { paymentBusinessDateRangeWhere } from '@/lib/services/reporting/payment-business-date';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONEY_ZERO = new Decimal(0);

export class LoyaltyReportValidationError extends Error {
  readonly code = 'INVALID_REQUEST';
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'LoyaltyReportValidationError';
  }
}

export class LoyaltyReportNotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('Restaurant not found');
    this.name = 'LoyaltyReportNotFoundError';
  }
}

type MoneyValue = Decimal | string | number | null | undefined;

function money(value: MoneyValue): string {
  if (value === null || value === undefined) return '0.00';
  return new Decimal(value.toString()).toFixed(2);
}

function decimal(value: MoneyValue): Decimal {
  if (value === null || value === undefined) return new Decimal(MONEY_ZERO);
  return new Decimal(value.toString());
}

function isRealDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseBusinessDate(value: string | null, label: string): BusinessDate {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!isRealDateOnly(trimmed)) {
    throw new LoyaltyReportValidationError(
      `${label} must be a business date in YYYY-MM-DD format`
    );
  }
  return trimmed;
}

function snapshotScope(
  snapshot: unknown
): 'ORDER' | 'CATEGORY' | 'ITEM' | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  const scope = (snapshot as { scope?: unknown }).scope;
  return scope === 'ORDER' || scope === 'CATEGORY' || scope === 'ITEM'
    ? scope
    : null;
}

export interface LoyaltyReportInput {
  restaurantId: string;
  from: string | null;
  to: string | null;
}

export interface LoyaltyReportScopeTotals {
  count: number;
  amount: string;
}

export interface LoyaltyReport {
  range: {
    from: BusinessDate;
    to: BusinessDate;
    timezone: string;
    currency: string;
  };
  gross: string;
  discounts: {
    total: string;
    bySource: {
      PROMOTION: string;
      LOYALTY_REWARD: string;
    };
  };
  net: string;
  refunds: string;
  /**
   * Rate-limit refusals recorded for this restaurant in the range. One event
   * per `(restaurantId, subject, hour)`, so this is a count of refused
   * subjects, not raw attempts.
   */
  refusals: number;
  visits: {
    count: number;
    uniqueMembers: number;
    repeatMembers: number;
    repeatRate: string;
  };
  rewards: {
    applied: number;
    amount: string;
  };
  promotionRedemptions: {
    total: number;
    byScope: {
      ORDER: LoyaltyReportScopeTotals;
      CATEGORY: LoyaltyReportScopeTotals;
      ITEM: LoyaltyReportScopeTotals;
    };
  };
  members: {
    total: number;
    active: number;
    anonymized: number;
    newInRange: number;
    marketingOptIn: number;
  };
}

function emptyScopeTotals(): LoyaltyReportScopeTotals {
  return { count: 0, amount: '0.00' };
}

/**
 * Build the loyalty report for one restaurant and one business-date range.
 * The range is inclusive at both ends.
 */
export async function getLoyaltyReport(
  input: LoyaltyReportInput
): Promise<LoyaltyReport> {
  const from = parseBusinessDate(input.from, 'from');
  const to = parseBusinessDate(input.to, 'to');
  if (from > to) {
    throw new LoyaltyReportValidationError('from must not be after to');
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: input.restaurantId },
    select: {
      timezone: true,
      businessDayCloseTime: true,
      currency: true,
    },
  });
  if (!restaurant) throw new LoyaltyReportNotFoundError();

  const clock = {
    timezone: restaurant.timezone,
    closeTime: restaurant.businessDayCloseTime,
  };
  const rangeStart = getBusinessDayStart(from, clock);
  const rangeEnd = getBusinessDayEnd(to, clock);
  const fromDb = toDbBusinessDate(from);
  const toDb = toDbBusinessDate(to);

  const batches = await prisma.paymentBatch.findMany({
    where: {
      restaurantId: input.restaurantId,
      businessDate: { gte: fromDb, lte: toDb },
    },
    select: {
      id: true,
      payments: {
        select: { orderId: true, amount: true },
      },
    },
  });

  // A legacy payment can have no `PaymentBatch`, so it has no `businessDate`.
  // Attribute it with the shared payment-business-date rule (REVIEW-29
  // B-PAY-2): `createdAt` through the restaurant clock. `batchId: null` is
  // disjoint from every payment counted through a batch, so this can never
  // double-count one.
  const batchlessPositives = await prisma.payment.findMany({
    where: {
      order: { restaurantId: input.restaurantId },
      amount: { gt: 0 },
      batchId: null,
      status: 'PAID',
      ...paymentBusinessDateRangeWhere(from, to, clock),
    },
    select: { orderId: true, amount: true },
  });

  const orderIds = Array.from(
    new Set([
      ...batches.flatMap((batch) =>
        batch.payments.map((payment) => payment.orderId)
      ),
      ...batchlessPositives.map((payment) => payment.orderId),
    ])
  );

  let gross = new Decimal(MONEY_ZERO);
  if (orderIds.length > 0) {
    const orderAggregate = await prisma.order.aggregate({
      where: { restaurantId: input.restaurantId, id: { in: orderIds } },
      _sum: { subtotalAmount: true },
    });
    gross = decimal(orderAggregate._sum.subtotalAmount);
  }

  let net = new Decimal(MONEY_ZERO);
  for (const batch of batches) {
    for (const payment of batch.payments) {
      net = net.plus(decimal(payment.amount));
    }
  }
  for (const payment of batchlessPositives) {
    net = net.plus(decimal(payment.amount));
  }

  // Refunds are written as negative payments and have no `PaymentBatch`, so a
  // batch-only read always reports `0.00`. Attribute each refund with the same
  // shared payment-business-date rule as the Z and the P&L (REVIEW-29 B-PAY-2),
  // never to the original sale date. No batch filter: batchless refunds must be
  // counted too.
  const refundRows = await prisma.payment.findMany({
    where: {
      order: { restaurantId: input.restaurantId },
      amount: { lt: 0 },
      ...paymentBusinessDateRangeWhere(from, to, clock),
    },
    select: { amount: true, batchId: true },
  });
  let refunds = new Decimal(MONEY_ZERO);
  for (const row of refundRows) {
    refunds = refunds.plus(decimal(row.amount).abs());
    // A refund payment has no batch, so it is absent from `net` above. Add it
    // once here. Batch-attached payments are already in `net`, so they are not
    // added again (§18.20.8 `net = Σ Payment.amount`, no double-count).
    if (row.batchId === null) {
      net = net.plus(decimal(row.amount));
    }
  }

  const discountRows =
    orderIds.length > 0
      ? await prisma.orderDiscount.findMany({
          where: {
            restaurantId: input.restaurantId,
            orderId: { in: orderIds },
            status: 'ACTIVE',
          },
          select: {
            source: true,
            amount: true,
            sourceId: true,
            promotionSnapshot: true,
          },
        })
      : [];

  const discountsBySource = {
    PROMOTION: new Decimal(MONEY_ZERO),
    LOYALTY_REWARD: new Decimal(MONEY_ZERO),
  };
  let rewardCount = 0;
  let rewardAmount = new Decimal(MONEY_ZERO);
  const promotionRows = discountRows.filter(
    (row) => row.source === 'PROMOTION'
  );

  for (const row of discountRows) {
    const amount = decimal(row.amount);
    if (row.source === 'PROMOTION') {
      discountsBySource.PROMOTION = discountsBySource.PROMOTION.plus(amount);
    } else if (row.source === 'LOYALTY_REWARD') {
      discountsBySource.LOYALTY_REWARD =
        discountsBySource.LOYALTY_REWARD.plus(amount);
      rewardCount += 1;
      rewardAmount = rewardAmount.plus(amount);
    }
  }

  // `promotionSnapshot.scope` is written at application time. Fall back to the
  // promotion row only if an older row lacks a snapshot scope.
  const missingScopeIds = Array.from(
    new Set(
      promotionRows
        .filter((row) => snapshotScope(row.promotionSnapshot) === null)
        .map((row) => row.sourceId)
    )
  );
  const promotionScopes = new Map<string, 'ORDER' | 'CATEGORY' | 'ITEM'>();
  if (missingScopeIds.length > 0) {
    const promotions = await prisma.promotion.findMany({
      where: {
        restaurantId: input.restaurantId,
        id: { in: missingScopeIds },
      },
      select: { id: true, scope: true },
    });
    for (const promotion of promotions) {
      promotionScopes.set(promotion.id, promotion.scope);
    }
  }

  const promotionRedemptions = {
    ORDER: emptyScopeTotals(),
    CATEGORY: emptyScopeTotals(),
    ITEM: emptyScopeTotals(),
  };
  const promotionAmounts = {
    ORDER: new Decimal(MONEY_ZERO),
    CATEGORY: new Decimal(MONEY_ZERO),
    ITEM: new Decimal(MONEY_ZERO),
  };
  let resolvedPromotionCount = 0;

  for (const row of promotionRows) {
    const scope =
      snapshotScope(row.promotionSnapshot) ??
      promotionScopes.get(row.sourceId) ??
      null;
    if (!scope) continue;
    resolvedPromotionCount += 1;
    promotionRedemptions[scope].count += 1;
    promotionAmounts[scope] = promotionAmounts[scope].plus(decimal(row.amount));
  }
  for (const scope of ['ORDER', 'CATEGORY', 'ITEM'] as const) {
    promotionRedemptions[scope].amount = money(promotionAmounts[scope]);
  }

  const visitGroups = await prisma.loyaltyVisit.groupBy({
    by: ['customerId'],
    where: {
      restaurantId: input.restaurantId,
      businessDate: { gte: fromDb, lte: toDb },
    },
    _count: { _all: true },
  });
  const visitCount = visitGroups.reduce(
    (total, group) => total + group._count._all,
    0
  );
  const uniqueMembers = visitGroups.length;
  const repeatMembers = visitGroups.filter(
    (group) => group._count._all >= 2
  ).length;
  const repeatRate =
    uniqueMembers === 0
      ? '0.0000'
      : new Decimal(repeatMembers).div(uniqueMembers).toFixed(4);

  const [memberTotal, memberActive, memberAnonymized, memberNew, marketing] =
    await Promise.all([
      prisma.customer.count({
        where: { restaurantId: input.restaurantId },
      }),
      prisma.customer.count({
        where: { restaurantId: input.restaurantId, status: 'ACTIVE' },
      }),
      prisma.customer.count({
        where: { restaurantId: input.restaurantId, status: 'ANONYMIZED' },
      }),
      prisma.customer.count({
        where: {
          restaurantId: input.restaurantId,
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
      }),
      prisma.customer.count({
        where: {
          restaurantId: input.restaurantId,
          status: 'ACTIVE',
          marketingOptIn: true,
        },
      }),
    ]);

  // Refusals are one event per `(restaurantId, subject, hour)`, written by the
  // QR routes. Scoped by tenant so a shared IP cannot leak another venue's
  // security activity into this report.
  const refusals = await prisma.securityEvent.count({
    where: {
      restaurantId: input.restaurantId,
      eventType: RATE_LIMITED_EVENT,
      createdAt: { gte: rangeStart, lte: rangeEnd },
    },
  });

  return {
    range: {
      from,
      to,
      timezone: restaurant.timezone,
      currency: restaurant.currency,
    },
    gross: money(gross),
    discounts: {
      total: money(
        discountsBySource.PROMOTION.plus(discountsBySource.LOYALTY_REWARD)
      ),
      bySource: {
        PROMOTION: money(discountsBySource.PROMOTION),
        LOYALTY_REWARD: money(discountsBySource.LOYALTY_REWARD),
      },
    },
    net: money(net),
    refunds: money(refunds),
    refusals,
    visits: {
      count: visitCount,
      uniqueMembers,
      repeatMembers,
      repeatRate,
    },
    rewards: {
      applied: rewardCount,
      amount: money(rewardAmount),
    },
    promotionRedemptions: {
      total: resolvedPromotionCount,
      byScope: promotionRedemptions,
    },
    members: {
      total: memberTotal,
      active: memberActive,
      anonymized: memberAnonymized,
      newInRange: memberNew,
      marketingOptIn: marketing,
    },
  };
}
