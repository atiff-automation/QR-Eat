/**
 * Loyalty re-evaluation for unpaid order/session modification.
 *
 * `POST /api/orders/{id}/modify` rewrites an unpaid order's contents. Under the
 * P5B price lock the bill read and payment price an order from its ACTIVE
 * `OrderDiscount` rows, so a modification must refresh that ledger in the same
 * transaction: re-evaluate the promotion against the new lines with the P2
 * engine, update/replace/remove the single ACTIVE promotion row, recompute
 * tax/service per order from the rate snapshots, and bump the bill revision so
 * a stale `expectedBillRevision` fails with `BILL_CHANGED` (§18.20.14 I).
 *
 * Paid orders are never re-evaluated: correction is deferred (§18.20.15 A).
 * When loyalty is inactive the caller keeps the pre-loyalty behaviour exactly;
 * this module returns `null` and writes nothing.
 *
 * Money uses `decimal.js` only. No phone number or other PII is read or logged.
 */

import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import type { TransactionClient } from '@/lib/database';
import { isLoyaltyActive } from '@/lib/loyalty/flags';
import {
  evaluatePromotion,
  type PromotionCandidate,
  type PromotionLine,
} from '@/lib/loyalty/promotion';
import { sumMoney, toMoneyString, type MoneyInput } from '@/lib/loyalty/money';
import { recomputeOrderTotals } from '@/lib/loyalty/tax';
import { toPromotionCandidate } from '@/lib/services/loyalty-qr-service';
import { getBusinessDate, toDbBusinessDate } from '@/lib/time/business-day';

/** One order line after the modification has been applied. */
export interface ModifiedOrderLine {
  menuItemId: string;
  totalAmount: MoneyInput;
  menuItem: { name: string; categoryId: string };
}

export interface ReapplyPromotionInput {
  restaurantId: string;
  orderId: string;
  diningSessionId: string | null;
  items: readonly ModifiedOrderLine[];
  taxRate: MoneyInput;
  serviceRate: MoneyInput;
  actorId: string;
  actorType?: string | null;
  now: Date;
}

/**
 * The per-order totals and discount summary after re-evaluation. The caller
 * writes these onto `Order` and bumps `Order.discountVersion`.
 */
export interface ModifiedOrderPricing {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  serviceCharge: Decimal;
  totalAmount: Decimal;
  discountSource: 'PROMOTION' | null;
  discountLabel: string | null;
  promotionApplied: boolean;
  promotionId: string | null;
  eligibleBase: Decimal;
}

function promotionSnapshot(
  promotion: PromotionCandidate
): Prisma.InputJsonValue {
  return {
    name: promotion.name,
    type: promotion.type,
    value: toMoneyString(promotion.value),
    scope: promotion.scope,
    categoryIds: [...promotion.categoryIds],
    itemIds: [...promotion.itemIds],
    minSpend: toMoneyString(promotion.minSpend),
    maxDiscount: toMoneyString(promotion.maxDiscount),
    receiptLabel: promotion.receiptLabel ?? null,
  } as Prisma.InputJsonValue;
}

interface SessionDiscountRow {
  source: 'PROMOTION' | 'LOYALTY_REWARD';
  sourceId: string;
  label: string;
  amount: MoneyInput;
}

/**
 * The bill-level label for a session, matching the payment path: a reward uses
 * its own label, multiple distinct promotions use `'Promotions'`, and a mixed
 * bill (`MULTIPLE`) has no single label.
 */
function sessionDiscountLabel(
  rows: readonly SessionDiscountRow[],
  source: 'PROMOTION' | 'LOYALTY_REWARD' | 'MULTIPLE' | null
): string | null {
  if (source === 'LOYALTY_REWARD') {
    return rows.find((row) => row.source === 'LOYALTY_REWARD')?.label ?? null;
  }
  if (source !== 'PROMOTION') return null;

  const promotions = rows.filter((row) => row.source === 'PROMOTION');
  const ids = new Set(promotions.map((row) => row.sourceId));
  const labels = new Set(promotions.map((row) => row.label));
  return ids.size > 1 || labels.size > 1
    ? 'Promotions'
    : (promotions[0]?.label ?? null);
}

async function loadActivePromotionCandidates(
  db: TransactionClient,
  restaurantId: string,
  now: Date
): Promise<PromotionCandidate[]> {
  const rows = await db.promotion.findMany({
    where: {
      restaurantId,
      isActive: true,
      deletedAt: null,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    include: {
      promotionCategories: { select: { categoryId: true } },
      promotionItems: { select: { itemId: true } },
    },
  });

  return rows.map((row) => toPromotionCandidate(row));
}

/**
 * Re-evaluate the promotion for one modified unpaid order and update the
 * ACTIVE ledger. Returns `null` when loyalty is inactive, so the caller keeps
 * the legacy totals path byte-for-byte.
 *
 * The caller must already hold the bill lock (and, when a member is present,
 * the customer/day lock) and must have persisted the item changes.
 */
export async function reapplyPromotionForModifiedOrder(
  tx: TransactionClient,
  input: ReapplyPromotionInput
): Promise<ModifiedOrderPricing | null> {
  const settings = await tx.loyaltySettings.findUnique({
    where: { restaurantId: input.restaurantId },
  });
  if (!isLoyaltyActive(settings)) return null;

  const lines: PromotionLine[] = input.items.map((item) => ({
    itemId: item.menuItemId,
    categoryId: item.menuItem.categoryId,
    name: item.menuItem.name,
    lineTotal: item.totalAmount,
  }));
  const subtotal = sumMoney(input.items.map((item) => item.totalAmount));

  const promotions = await loadActivePromotionCandidates(
    tx,
    input.restaurantId,
    input.now
  );
  const result = evaluatePromotion({ lines, promotions, at: input.now });
  const appliedPromotion = result.applied
    ? (promotions.find((promotion) => promotion.id === result.promotionId) ??
      null)
    : null;

  // Exactly one ACTIVE row per order is enforced by a partial unique index.
  // Read it under the lock, then update/replace/remove it; never stack.
  const existing = await tx.orderDiscount.findMany({
    where: {
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      source: true,
      sourceId: true,
      label: true,
      baseAmount: true,
      amount: true,
    },
  });
  const existingPromotionRows = existing.filter(
    (row) => row.source === 'PROMOTION'
  );

  if (result.applied && appliedPromotion) {
    const snapshot = promotionSnapshot(appliedPromotion);
    const label = result.label ?? appliedPromotion.name;

    if (existingPromotionRows.length > 0) {
      const [keep] = existingPromotionRows;
      // Defensive F-2: a stale ACTIVE row of any source must not survive next
      // to the kept promotion row (the partial unique index allows one ACTIVE
      // row). Replace every other ACTIVE row, not just promotion rows.
      const superseded = existing.filter((row) => row.id !== keep.id);
      await tx.orderDiscount.update({
        where: { id: keep.id },
        data: {
          source: 'PROMOTION',
          sourceId: appliedPromotion.id,
          label,
          baseAmount: result.eligibleBase,
          amount: result.discountAmount,
          promotionSnapshot: snapshot,
          // The snapshot CHECK requires exactly one snapshot to be present.
          rewardSnapshot: Prisma.DbNull,
          status: 'ACTIVE',
          actorType: input.actorType ?? null,
          actorId: input.actorId,
          reason: 'Promotion re-evaluated after order modification',
        },
      });

      if (superseded.length > 0) {
        await tx.orderDiscount.updateMany({
          where: { id: { in: superseded.map((row) => row.id) } },
          data: {
            status: 'REPLACED',
            reason: 'Superseded by promotion re-evaluation',
          },
        });
      }
    } else {
      // A stale reward row on an unpaid order must not stack with the new
      // promotion row (and the partial unique index allows only one ACTIVE row).
      if (existing.length > 0) {
        await tx.orderDiscount.updateMany({
          where: { id: { in: existing.map((row) => row.id) } },
          data: {
            status: 'REMOVED',
            reason: 'Replaced by promotion re-evaluation',
          },
        });
      }

      await tx.orderDiscount.create({
        data: {
          orderId: input.orderId,
          restaurantId: input.restaurantId,
          diningSessionId: input.diningSessionId,
          source: 'PROMOTION',
          sourceId: appliedPromotion.id,
          label,
          baseAmount: result.eligibleBase,
          amount: result.discountAmount,
          promotionSnapshot: snapshot,
          rewardSnapshot: undefined,
          status: 'ACTIVE',
          actorType: input.actorType ?? null,
          actorId: input.actorId,
          reason: 'Promotion re-evaluated after order modification',
        },
      });
    }
  } else if (existing.length > 0) {
    // No eligible base remains for this order. Remove every ACTIVE row of any
    // source (F-2): a stale LOYALTY_REWARD row would otherwise survive with a
    // base that no longer matches the modified contents and break
    // `Order.discountAmount == Σ ACTIVE OrderDiscount.amount`. REMOVED keeps the
    // row as history; the bill read only prices ACTIVE rows, so the promotion
    // stops blocking the visit unless another order still carries one.
    await tx.orderDiscount.updateMany({
      where: { id: { in: existing.map((row) => row.id) } },
      data: {
        status: 'REMOVED',
        reason: 'Discount no longer eligible after order modification',
      },
    });
  }

  const oldPromotion = existingPromotionRows[0] ?? null;
  await tx.auditLog.create({
    data: {
      tableName: 'orders',
      recordId: input.orderId,
      operation: 'UPDATE',
      oldValues: {
        discountSource: oldPromotion ? 'PROMOTION' : null,
        discountAmount: oldPromotion
          ? toMoneyString(oldPromotion.amount)
          : null,
        promotionId: oldPromotion?.sourceId ?? null,
      },
      newValues: {
        discountSource: result.applied ? 'PROMOTION' : null,
        discountAmount: result.applied
          ? toMoneyString(result.discountAmount)
          : null,
        promotionId: result.promotionId,
        subtotal: toMoneyString(subtotal),
      },
      changedBy: input.actorId,
      changedByType: input.actorType ?? null,
      restaurantId: input.restaurantId,
      severity: 'info',
      category: 'orders',
      description: 'Promotion re-evaluated after order modification',
      metadata: {
        action: 'promotion_reevaluate',
        promotionApplied: result.applied,
      },
    },
  });

  const discountAmount = result.applied
    ? result.discountAmount
    : new Decimal(0);
  const totals = recomputeOrderTotals({
    subtotal,
    discountAmount,
    taxRate: input.taxRate,
    serviceRate: input.serviceRate,
  });

  // The bill revision is the price lock for every reader of this bill. A
  // modification changes the totals, so it must always move (§18.20.14 I).
  // F-3/R-01: the cached session summary is refreshed in the same transaction
  // and over the same payable set as the payment writer, so the two paths
  // cannot persist different bill-level values.
  if (input.diningSessionId) {
    const sessionDiscounts = await tx.orderDiscount.findMany({
      where: {
        restaurantId: input.restaurantId,
        diningSessionId: input.diningSessionId,
        status: 'ACTIVE',
        order: {
          paymentStatus: 'PENDING',
          status: { not: 'CANCELLED' },
        },
      },
      select: {
        source: true,
        sourceId: true,
        label: true,
        amount: true,
      },
    });
    const sessionDiscountAmount = sumMoney(
      sessionDiscounts.map((row) => row.amount)
    );
    const hasPromotion = sessionDiscounts.some(
      (row) => row.source === 'PROMOTION'
    );
    const hasReward = sessionDiscounts.some(
      (row) => row.source === 'LOYALTY_REWARD'
    );
    const sessionSource =
      hasPromotion && hasReward
        ? ('MULTIPLE' as const)
        : hasReward
          ? ('LOYALTY_REWARD' as const)
          : hasPromotion
            ? ('PROMOTION' as const)
            : null;

    await tx.diningSession.update({
      where: {
        restaurantId_id: {
          restaurantId: input.restaurantId,
          id: input.diningSessionId,
        },
      },
      data: {
        billRevision: { increment: 1 },
        discountAmount: sessionDiscountAmount,
        discountSource: sessionSource,
        discountLabel: sessionDiscountLabel(sessionDiscounts, sessionSource),
      },
    });
  }

  return {
    subtotal,
    discountAmount,
    taxAmount: totals.taxAmount,
    serviceCharge: totals.serviceCharge,
    totalAmount: totals.totalAmount,
    discountSource: result.applied ? 'PROMOTION' : null,
    discountLabel: result.applied ? (result.label ?? null) : null,
    promotionApplied: result.applied,
    promotionId: result.promotionId,
    eligibleBase: result.eligibleBase,
  };
}

/**
 * Take the same locks as the bill read and payment: customer/day first, then
 * the bill/order lock. The lock order must never be inverted (§18.20.14 F).
 *
 * The day lock is taken only when a member is present; the bill lock is always
 * taken so a concurrent modification/payment serialises even while the feature
 * flag is off.
 */
export async function acquireOrderModificationLocks(
  tx: TransactionClient,
  input: {
    restaurantId: string;
    orderId: string;
    diningSessionId: string | null;
    customerId: string | null;
    now: Date;
  }
): Promise<string> {
  if (input.customerId) {
    const restaurant = await tx.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { timezone: true, businessDayCloseTime: true },
    });
    const clock = {
      timezone: restaurant?.timezone || 'Asia/Kuala_Lumpur',
      closeTime: restaurant?.businessDayCloseTime || '04:00',
    };
    const businessDate = toDbBusinessDate(getBusinessDate(input.now, clock));

    await acquireLock(
      tx,
      `loyalty-day:${input.restaurantId}:${input.customerId}:${businessDate
        .toISOString()
        .slice(0, 10)}`
    );
  }

  const billLockKey = `loyalty-bill:${input.restaurantId}:${
    input.diningSessionId ?? input.orderId
  }`;
  await acquireLock(tx, billLockKey);
  return billLockKey;
}

async function acquireLock(
  tx: TransactionClient,
  lockKey: string
): Promise<void> {
  // pg_advisory_xact_lock returns void; cast it to text so Prisma can decode it.
  await tx.$queryRaw<Array<{ lock: string }>>`
    SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
  `;
}
