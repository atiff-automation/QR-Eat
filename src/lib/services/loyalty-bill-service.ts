/**
 * Counter and takeaway bill projection plus member attach/change.
 *
 * The routes stay thin: this module resolves the current unpaid bill, evaluates
 * promotions with the P2 engine, projects the loyalty reward, and returns the
 * §18.20.6 bill-read fields. Member attach/change is bill-level and re-prices
 * the projection only; it never writes `OrderDiscount`, `LoyaltyVisit`,
 * `LoyaltyCard` or any payment row (§18.20.6, §18.20.14 B/C/E/K, §18.20.15 D/E).
 *
 * Money uses `decimal.js` only. The full phone number never leaves this module:
 * the projection carries `maskedPhone`, and the idempotency request hash stores
 * only a digest.
 */

import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma, type TransactionClient } from '@/lib/database';
import { isLoyaltyActive, isLoyaltyGloballyEnabled } from '@/lib/loyalty/flags';
import { resolveNotice, type LoyaltyNotice } from '@/lib/loyalty/consent';
import { hashPhone, maskPhone, normalisePhone } from '@/lib/loyalty/phone';
import {
  evaluatePromotion,
  type PromotionCandidate,
  type PromotionLine,
  type PromotionResult,
  type PromotionScope,
} from '@/lib/loyalty/promotion';
import {
  allocateReward,
  projectReward,
  type RewardCardSnapshot,
  type RewardRule,
  type RewardType,
} from '@/lib/loyalty/reward';
import {
  recomputeOrderTotals,
  type RecomputedOrderTotals,
} from '@/lib/loyalty/tax';
import { resolveVisitState, type VisitState } from '@/lib/loyalty/visit';
import {
  round5,
  sumMoney,
  toMoneyString,
  type MoneyInput,
} from '@/lib/loyalty/money';
import { resolveOrCreateCustomer } from '@/lib/services/loyalty-customer-service';
import { getBusinessDate, toDbBusinessDate } from '@/lib/time/business-day';

// ============================================================================
// Bill projection
// ============================================================================

/** One order of the bill, narrowed to what the projection needs. */
export interface BillOrderRow {
  id: string;
  subtotalAmount: MoneyInput;
  taxRateSnapshot: MoneyInput;
  serviceChargeRateSnapshot: MoneyInput;
  paymentStatus: string;
  status: string;
  items: readonly {
    menuItemId: string;
    totalAmount: MoneyInput;
    menuItem: { name: string; categoryId: string };
  }[];
}

/** Prisma select for a bill order row. Extra fields may be added by callers. */
export const BILL_ORDER_SELECT = {
  id: true,
  subtotalAmount: true,
  taxRateSnapshot: true,
  serviceChargeRateSnapshot: true,
  paymentStatus: true,
  status: true,
  items: {
    select: {
      menuItemId: true,
      totalAmount: true,
      menuItem: { select: { name: true, categoryId: true } },
    },
  },
} as const;

export interface BillProjectionMember {
  id: string;
  name: string | null;
  maskedPhone: string;
  completedVisits: number;
  visitsRequired: number;
}

export interface BillProjectionDiscountLine {
  orderId: string;
  source: 'PROMOTION' | 'LOYALTY_REWARD';
  label: string;
  amount: string;
}

/** The subset of `OrderDiscount.promotionSnapshot` the projection needs. */
export interface BillActiveDiscountSnapshot {
  name?: string;
  scope?: PromotionScope;
  receiptLabel?: string | null;
  categoryIds?: string[];
  itemIds?: string[];
}

/**
 * One ACTIVE `OrderDiscount` row. Payment prices an existing order from these
 * rows, not from a live promotion re-evaluation: order create is the definitive
 * price lock (§18.20.14 G/I).
 */
export interface BillActiveDiscount {
  orderId: string;
  source: 'PROMOTION' | 'LOYALTY_REWARD';
  sourceId: string;
  label: string;
  baseAmount: MoneyInput;
  amount: MoneyInput;
  promotionSnapshot?: BillActiveDiscountSnapshot | null;
}

/**
 * The §18.20.6 bill-read fields. Money is a two-decimal string at the API
 * boundary; the member carries a masked phone only.
 */
export interface BillProjection {
  billRevision: number;
  member: BillProjectionMember | null;
  visitState: VisitState;
  promotionApplied: boolean;
  promotionScope: PromotionScope | 'MULTIPLE' | null;
  promotionLabel: string | null;
  promotionItems: Array<{ itemId: string; name: string }>;
  promotionDiscountAmount: string;
  discountAmount: string;
  discountSource: 'PROMOTION' | 'LOYALTY_REWARD' | null;
  discountLabel: string | null;
  discountLines: BillProjectionDiscountLine[];
  rewardLabel: string | null;
  rewardType: RewardType;
  rewardValue: string;
  maxDiscount: string;
  subtotal: string;
  taxAmount: string;
  serviceCharge: string;
  fullPriceTotal: string;
  preRewardCashPayable: string;
  projectedRewardAmount: string;
  projectedTotal: string;
  preRewardTotal: string;
  totalAmount: string;
  cashPayable: string;
  daySubtotal: string;
  minDailySpend: string;
  amountToMinimum: string;
}

export interface ComputeBillProjectionInput {
  billRevision: number;
  orders: readonly BillOrderRow[];
  promotions: readonly PromotionCandidate[];
  /**
   * When provided, price each order from its ACTIVE ledger rows instead of the
   * live promotion set. Payment uses this so an order-time price lock stands
   * even after the promotion's window closes (§18.20.14 G/I).
   */
  activeDiscounts?: readonly BillActiveDiscount[];
  settings: RewardRule;
  card: RewardCardSnapshot | null;
  /**
   * The resolved member. The loader only passes an ACTIVE customer with a valid
   * consent; `null` means the bill is a guest bill.
   */
  customer: { id: string; name: string | null; phone: string | null } | null;
  alreadyCounted: boolean;
  daySubtotal: MoneyInput;
  cashRounding: 'NONE' | 'NEAREST_5_SEN' | null;
  now: Date;
}

/**
 * Per-order pricing detail for the payment ledger. This is the same `priced`
 * data the bill projection already computes; exposing it lets payment write
 * the reward ledger without re-implementing the projection (R-04).
 */
export interface BillPricingOrder {
  orderId: string;
  promotionApplied: boolean;
  promotionId: string | null;
  /** The resolved candidate, for the `promotionSnapshot`. */
  promotion: PromotionCandidate | null;
  promotionLabel: string | null;
  eligibleBase: Decimal;
  promotionDiscount: Decimal;
  rewardAllocation: Decimal;
  preRewardTotals: RecomputedOrderTotals;
  projectedTotals: RecomputedOrderTotals;
  fullPriceTotals: RecomputedOrderTotals;
}

export interface BillPricingReward {
  amount: Decimal;
  applies: boolean;
  label: string;
  rewardType: RewardType;
  rewardValue: MoneyInput;
  maxDiscount: MoneyInput;
  visitsRequired: number;
  completedVisits: number;
}

export interface BillPricingResult {
  projection: BillProjection;
  orders: BillPricingOrder[];
  reward: BillPricingReward;
  /** The card snapshot in force, or the current settings before a card exists. */
  rule: RewardRule;
}

function toPromotionLines(order: BillOrderRow): PromotionLine[] {
  return order.items.map((item) => ({
    itemId: item.menuItemId,
    categoryId: item.menuItem.categoryId,
    name: item.menuItem.name,
    lineTotal: item.totalAmount,
  }));
}

function rewardValueText(rule: RewardRule): string {
  return rule.rewardType === 'PERCENT'
    ? new Decimal(rule.rewardValue).toFixed(0)
    : toMoneyString(rule.rewardValue);
}

function promotionCopyItems(
  applied: readonly {
    result: { items: readonly { itemId: string; name: string }[] };
  }[]
): Array<{ itemId: string; name: string }> {
  const items = new Map<string, { itemId: string; name: string }>();
  for (const entry of applied) {
    for (const item of entry.result.items) {
      items.set(item.itemId, { itemId: item.itemId, name: item.name });
    }
  }
  return [...items.values()];
}

function groupActiveDiscounts(
  rows: readonly BillActiveDiscount[]
): Map<string, BillActiveDiscount[]> {
  const byOrder = new Map<string, BillActiveDiscount[]>();
  for (const row of rows) {
    const current = byOrder.get(row.orderId) ?? [];
    current.push(row);
    byOrder.set(row.orderId, current);
  }
  return byOrder;
}

const NO_PROMOTION: PromotionResult = {
  applied: false,
  promotionId: null,
  promotionName: null,
  label: null,
  scope: null,
  eligibleBase: new Decimal(0),
  discountAmount: new Decimal(0),
  items: [],
  partialOrder: false,
};

/**
 * Rebuild the eligible-item copy from the locked promotion snapshot and the
 * order lines. The bill read must keep returning `promotionItems` even though
 * the price comes from the ledger, not a live evaluation.
 */
function lockedPromotionItems(
  snapshot: BillActiveDiscountSnapshot | null,
  scope: PromotionScope,
  order: BillOrderRow
): PromotionResult['items'] {
  if (!snapshot || scope === 'ORDER') return [];

  const itemIds = new Set(snapshot.itemIds ?? []);
  const categoryIds = new Set(snapshot.categoryIds ?? []);
  const items = order.items.filter((item) =>
    scope === 'ITEM'
      ? itemIds.has(item.menuItemId)
      : categoryIds.has(item.menuItem.categoryId)
  );

  return items.map((item) => ({
    itemId: item.menuItemId,
    name: item.menuItem.name,
    lineTotal: new Decimal(item.totalAmount),
  }));
}

/**
 * Price one order from its ACTIVE `OrderDiscount` rows. An ACTIVE promotion row
 * is the order-time price lock: it applies regardless of the live promotion
 * window. No row means the order is full price.
 */
function lockedPromotionResult(
  rows: readonly BillActiveDiscount[],
  order: BillOrderRow
): PromotionResult {
  const row = rows.find((entry) => entry.source === 'PROMOTION');
  if (!row) return NO_PROMOTION;

  const snapshot = row.promotionSnapshot ?? null;
  const scope = snapshot?.scope ?? 'ORDER';
  const items = lockedPromotionItems(snapshot, scope, order);

  return {
    applied: true,
    promotionId: row.sourceId,
    promotionName: snapshot?.name ?? row.label,
    label: snapshot?.receiptLabel ?? snapshot?.name ?? row.label,
    scope,
    eligibleBase: new Decimal(row.baseAmount),
    discountAmount: new Decimal(row.amount),
    items,
    partialOrder: scope !== 'ORDER' && items.length < order.items.length,
  };
}

/**
 * Pure bill pricing. No I/O: callers supply the orders, promotions, settings,
 * card and member state. This is the single projection used by the dine-in and
 * takeaway bill reads, by member attach/change and by payment.
 */
export function computeBillPricing(
  input: ComputeBillProjectionInput
): BillPricingResult {
  const billOrders = input.orders.filter(
    (order) => order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED'
  );

  const lockedByOrder = input.activeDiscounts
    ? groupActiveDiscounts(input.activeDiscounts)
    : null;

  const evaluated = billOrders.map((order) => ({
    order,
    result: lockedByOrder
      ? lockedPromotionResult(lockedByOrder.get(order.id) ?? [], order)
      : evaluatePromotion({
          lines: toPromotionLines(order),
          promotions: input.promotions,
          at: input.now,
        }),
  }));

  const promotionApplied = evaluated.some((entry) => entry.result.applied);
  const promotionDiscountAmount = sumMoney(
    evaluated.map((entry) =>
      entry.result.applied ? entry.result.discountAmount : 0
    )
  );

  const subtotal = sumMoney(billOrders.map((order) => order.subtotalAmount));
  const rule = input.card ?? input.settings;
  const member: BillProjectionMember | null =
    input.customer && input.customer.phone
      ? {
          id: input.customer.id,
          name: input.customer.name,
          maskedPhone: maskPhone(input.customer.phone),
          completedVisits: input.card?.visitsInCycle ?? 0,
          visitsRequired: rule.visitsRequired,
        }
      : null;

  const visitState = resolveVisitState({
    hasMember: member !== null,
    hasConsent: member !== null,
    hasPromotion: promotionApplied,
    alreadyCounted: member !== null ? input.alreadyCounted : false,
    daySubtotal: input.daySubtotal,
    minDailySpend: rule.minDailySpend,
  });

  const reward =
    visitState === 'COUNTS'
      ? projectReward({
          subtotal,
          card: input.card,
          settings: input.settings,
          hasPromotion: promotionApplied,
        })
      : {
          amount: new Decimal(0),
          applies: false,
          label: rule.rewardLabel,
          visitsRequired: rule.visitsRequired,
          completedVisits: input.card?.visitsInCycle ?? 0,
        };

  const projectedRewardAmount = reward.applies ? reward.amount : new Decimal(0);

  const allocations =
    projectedRewardAmount.gt(0) && billOrders.length > 0
      ? allocateReward({
          rewardAmount: projectedRewardAmount,
          orders: billOrders.map((order) => ({
            orderId: order.id,
            subtotal: order.subtotalAmount,
          })),
        })
      : billOrders.map((order) => ({
          orderId: order.id,
          amount: new Decimal(0),
        }));

  const allocationByOrder = new Map(
    allocations.map((entry) => [entry.orderId, entry.amount])
  );

  const priced = evaluated.map((entry) => {
    const promotionDiscount = entry.result.applied
      ? entry.result.discountAmount
      : new Decimal(0);
    const rewardAllocation =
      allocationByOrder.get(entry.order.id) ?? new Decimal(0);

    return {
      order: entry.order,
      result: entry.result,
      promotionDiscount,
      rewardAllocation,
      preRewardTotals: recomputeOrderTotals({
        subtotal: entry.order.subtotalAmount,
        discountAmount: promotionDiscount,
        taxRate: entry.order.taxRateSnapshot,
        serviceRate: entry.order.serviceChargeRateSnapshot,
      }),
      projectedTotals: recomputeOrderTotals({
        subtotal: entry.order.subtotalAmount,
        discountAmount: promotionDiscount.plus(rewardAllocation),
        taxRate: entry.order.taxRateSnapshot,
        serviceRate: entry.order.serviceChargeRateSnapshot,
      }),
      fullPriceTotals: recomputeOrderTotals({
        subtotal: entry.order.subtotalAmount,
        discountAmount: 0,
        taxRate: entry.order.taxRateSnapshot,
        serviceRate: entry.order.serviceChargeRateSnapshot,
      }),
    };
  });

  const discountLines: BillProjectionDiscountLine[] = [];
  for (const entry of priced) {
    if (entry.result.applied) {
      discountLines.push({
        orderId: entry.order.id,
        source: 'PROMOTION',
        label: entry.result.label ?? entry.result.promotionName ?? 'Promotion',
        amount: toMoneyString(entry.promotionDiscount),
      });
    }
  }
  for (const entry of priced) {
    if (entry.rewardAllocation.gt(0)) {
      discountLines.push({
        orderId: entry.order.id,
        source: 'LOYALTY_REWARD',
        label: reward.label,
        amount: toMoneyString(entry.rewardAllocation),
      });
    }
  }

  const applied = priced.filter((entry) => entry.result.applied);
  const distinctPromotionIds = new Set(
    applied.map((entry) => entry.result.promotionId)
  );
  const distinctScopes = new Set(applied.map((entry) => entry.result.scope));
  const distinctLabels = new Set(applied.map((entry) => entry.result.label));

  const isMultiple =
    applied.length > 0 &&
    (distinctPromotionIds.size > 1 ||
      distinctScopes.size > 1 ||
      distinctLabels.size > 1);

  const promotionScope: PromotionScope | 'MULTIPLE' | null =
    applied.length === 0
      ? null
      : isMultiple
        ? 'MULTIPLE'
        : (applied[0].result.scope as PromotionScope);
  const promotionLabel =
    applied.length === 0
      ? null
      : isMultiple
        ? 'Promotions'
        : applied[0].result.label;

  const taxAmount = sumMoney(
    priced.map((entry) => entry.projectedTotals.taxAmount)
  );
  const serviceCharge = sumMoney(
    priced.map((entry) => entry.projectedTotals.serviceCharge)
  );
  const fullPriceTotal = sumMoney(
    priced.map((entry) => entry.fullPriceTotals.totalAmount)
  );
  const preRewardTotal = sumMoney(
    priced.map((entry) => entry.preRewardTotals.totalAmount)
  );
  const projectedTotal = sumMoney(
    priced.map((entry) => entry.projectedTotals.totalAmount)
  );
  const discountAmount = promotionDiscountAmount.plus(projectedRewardAmount);
  const cashPayable =
    input.cashRounding === 'NEAREST_5_SEN'
      ? round5(projectedTotal)
      : projectedTotal;
  const preRewardCashPayable =
    input.cashRounding === 'NEAREST_5_SEN'
      ? round5(preRewardTotal)
      : preRewardTotal;
  const amountToMinimum = member
    ? Decimal.max(0, new Decimal(rule.minDailySpend).minus(input.daySubtotal))
    : new Decimal(0);

  // A promotion and a reward never coexist (§18.20.15 C), so the bill-level
  // source is exactly one of these; `MULTIPLE` is not a bill source.
  const discountSource: BillProjection['discountSource'] =
    projectedRewardAmount.gt(0)
      ? 'LOYALTY_REWARD'
      : promotionDiscountAmount.gt(0)
        ? 'PROMOTION'
        : null;

  const discountLabel =
    discountSource === 'PROMOTION'
      ? promotionLabel
      : discountSource === 'LOYALTY_REWARD'
        ? reward.label
        : null;

  const pricingOrders: BillPricingOrder[] = priced.map((entry) => ({
    orderId: entry.order.id,
    promotionApplied: entry.result.applied,
    promotionId: entry.result.promotionId,
    promotion: entry.result.promotionId
      ? (input.promotions.find(
          (promotion) => promotion.id === entry.result.promotionId
        ) ?? null)
      : null,
    promotionLabel: entry.result.applied
      ? (entry.result.label ?? entry.result.promotionName ?? 'Promotion')
      : null,
    eligibleBase: entry.result.eligibleBase,
    promotionDiscount: entry.promotionDiscount,
    rewardAllocation: entry.rewardAllocation,
    preRewardTotals: entry.preRewardTotals,
    projectedTotals: entry.projectedTotals,
    fullPriceTotals: entry.fullPriceTotals,
  }));

  const projection: BillProjection = {
    billRevision: input.billRevision,
    member,
    visitState,
    promotionApplied,
    promotionScope,
    promotionLabel,
    promotionItems: promotionCopyItems(applied),
    promotionDiscountAmount: toMoneyString(promotionDiscountAmount),
    discountAmount: toMoneyString(discountAmount),
    discountSource,
    discountLabel,
    discountLines,
    rewardLabel: rule.rewardLabel,
    rewardType: rule.rewardType,
    rewardValue: rewardValueText(rule),
    maxDiscount: toMoneyString(rule.maxDiscount),
    subtotal: toMoneyString(subtotal),
    taxAmount: toMoneyString(taxAmount),
    serviceCharge: toMoneyString(serviceCharge),
    fullPriceTotal: toMoneyString(fullPriceTotal),
    preRewardCashPayable: toMoneyString(preRewardCashPayable),
    projectedRewardAmount: toMoneyString(projectedRewardAmount),
    projectedTotal: toMoneyString(projectedTotal),
    preRewardTotal: toMoneyString(preRewardTotal),
    totalAmount: toMoneyString(projectedTotal),
    cashPayable: toMoneyString(cashPayable),
    daySubtotal: toMoneyString(input.daySubtotal),
    minDailySpend: toMoneyString(rule.minDailySpend),
    amountToMinimum: toMoneyString(amountToMinimum),
  };

  return {
    projection,
    orders: pricingOrders,
    reward: {
      amount: reward.amount,
      applies: reward.applies,
      label: reward.label,
      rewardType: rule.rewardType,
      rewardValue: rule.rewardValue,
      maxDiscount: rule.maxDiscount,
      visitsRequired: rule.visitsRequired,
      completedVisits: reward.completedVisits,
    },
    rule,
  };
}

/**
 * The §18.20.6 bill projection only. Kept as the public shape used by the bill
 * reads and member attach; `computeBillPricing` exposes the per-order ledger.
 */
export function computeBillProjection(
  input: ComputeBillProjectionInput
): BillProjection {
  return computeBillPricing(input).projection;
}

// ============================================================================
// Bill loading
// ============================================================================

interface RewardRuleRow {
  visitsRequired: number;
  rewardType: RewardType;
  rewardValue: MoneyInput;
  maxDiscount: MoneyInput;
  rewardLabel: string;
  minDailySpend: MoneyInput;
}

function toRewardRule(row: RewardRuleRow): RewardRule {
  return {
    visitsRequired: row.visitsRequired,
    rewardType: row.rewardType,
    rewardValue: row.rewardValue,
    maxDiscount: row.maxDiscount,
    rewardLabel: row.rewardLabel,
    minDailySpend: row.minDailySpend,
  };
}

interface LoyaltyCardRow extends RewardRuleRow {
  visitsInCycle: number;
  cycleNumber: number;
}

function toCardSnapshot(row: LoyaltyCardRow): RewardCardSnapshot {
  return {
    visitsInCycle: row.visitsInCycle,
    cycleNumber: row.cycleNumber,
    ...toRewardRule(row),
  };
}

async function paidSubtotalForMember(
  db: TransactionClient,
  restaurantId: string,
  customerId: string,
  businessDate: Date
): Promise<Decimal> {
  const batches = await db.paymentBatch.findMany({
    where: { restaurantId, businessDate },
    select: {
      payments: {
        select: {
          order: {
            select: {
              id: true,
              customerId: true,
              status: true,
              paymentStatus: true,
              subtotalAmount: true,
            },
          },
        },
      },
    },
  });

  const counted = new Set<string>();
  let total = new Decimal(0);

  for (const batch of batches) {
    for (const payment of batch.payments) {
      const order = payment.order;
      if (!order || counted.has(order.id)) continue;
      if (order.customerId !== customerId) continue;
      if (order.status === 'CANCELLED') continue;
      if (order.paymentStatus === 'REFUNDED') continue;
      counted.add(order.id);
      total = total.plus(order.subtotalAmount);
    }
  }

  return total;
}

export interface ProjectBillInput {
  restaurantId: string;
  orders: readonly BillOrderRow[];
  customerId: string | null;
  billRevision: number;
  now?: Date;
  db?: TransactionClient;
  /**
   * Pre-loaded ACTIVE ledger rows. Payment passes the rows it read under the
   * bill lock; reads and member changes omit it and the loader reads them.
   * Either way the price source is the order-time lock, never a live promotion.
   */
  activeDiscounts?: readonly BillActiveDiscount[];
}

export interface BillPricingRestaurant {
  cashRounding: 'NONE' | 'NEAREST_5_SEN' | null;
  timezone: string | null;
  businessDayCloseTime: string | null;
}

export interface BillPricingCustomer {
  id: string;
  name: string | null;
  phone: string;
  phoneHash: string;
}

/**
 * The resolved loyalty context used by payment. It carries the member's
 * `phoneHash` (never the phone) for the visit snapshot and the payment
 * business date.
 */
export interface BillPricingContext {
  settings: RewardRule;
  restaurant: BillPricingRestaurant;
  customer: BillPricingCustomer | null;
  card: RewardCardSnapshot | null;
  businessDate: Date;
  alreadyCounted: boolean;
}

export interface BillPricingLoad {
  pricing: BillPricingResult;
  context: BillPricingContext;
}

/**
 * Load the ACTIVE ledger rows for the payable orders. This is the price source
 * for reads and payment: order create wrote the lock, so a read must not
 * re-evaluate a promotion against the live window (§18.20.14 G/I).
 */
async function loadBillActiveDiscounts(
  db: TransactionClient,
  restaurantId: string,
  orderIds: readonly string[]
): Promise<BillActiveDiscount[]> {
  if (orderIds.length === 0) return [];

  const rows = await db.orderDiscount.findMany({
    where: {
      restaurantId,
      orderId: { in: [...orderIds] },
      status: 'ACTIVE',
    },
    select: {
      orderId: true,
      source: true,
      sourceId: true,
      label: true,
      baseAmount: true,
      amount: true,
      promotionSnapshot: true,
    },
  });

  return rows.map((row) => ({
    orderId: row.orderId,
    source: row.source,
    sourceId: row.sourceId,
    label: row.label,
    baseAmount: row.baseAmount,
    amount: row.amount,
    promotionSnapshot:
      row.promotionSnapshot as BillActiveDiscountSnapshot | null,
  }));
}

/**
 * Load the loyalty context for a bill and project it, including the per-order
 * ledger. Payment uses this under the bill lock; the bill reads use the
 * projection-only wrapper below.
 *
 * Returns `null` when loyalty is inactive or the notice is unusable, so the
 * caller can keep the pre-loyalty response byte-identical.
 */
export async function projectBillPricing(
  input: ProjectBillInput
): Promise<BillPricingLoad | null> {
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();

  // Fail closed before any database read. The bill read must stay cheap when
  // the flag is off.
  if (!isLoyaltyGloballyEnabled()) return null;

  const settings = await db.loyaltySettings.findUnique({
    where: { restaurantId: input.restaurantId },
  });
  if (!settings || !isLoyaltyActive(settings)) return null;

  const notice = resolveNotice(settings);
  if (!notice) return null;

  const restaurant = await db.restaurant.findUnique({
    where: { id: input.restaurantId },
    select: {
      cashRounding: true,
      timezone: true,
      businessDayCloseTime: true,
    },
  });
  if (!restaurant) return null;

  // Reads price from the ACTIVE ledger: order create is the definitive price
  // lock (§18.20.14 G), so a locked promotion stands after its `endsAt` and the
  // bill can never show a higher total than the QR confirmation. Live
  // promotion re-evaluation belongs to the unpaid cart/session modification
  // path (QR quote), not to a read (§18.20.14 I).
  const pendingOrderIds = input.orders
    .filter(
      (order) =>
        order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED'
    )
    .map((order) => order.id);
  const activeDiscounts =
    input.activeDiscounts ??
    (await loadBillActiveDiscounts(db, input.restaurantId, pendingOrderIds));

  const clock = {
    timezone: restaurant.timezone || 'Asia/Kuala_Lumpur',
    closeTime: restaurant.businessDayCloseTime || '04:00',
  };
  // The payment business date is needed even for a guest bill: the
  // `PaymentBatch` writes it for every paid batch.
  const businessDate = toDbBusinessDate(getBusinessDate(now, clock));

  let customer: BillPricingCustomer | null = null;
  let card: RewardCardSnapshot | null = null;
  let alreadyCounted = false;
  let paidSubtotal = new Decimal(0);

  if (input.customerId) {
    const row = await db.customer.findFirst({
      where: {
        id: input.customerId,
        restaurantId: input.restaurantId,
        status: 'ACTIVE',
      },
    });

    // A member resolves only with a valid stored consent. A withdrawn or
    // anonymised member leaves the bill a guest bill.
    if (row && row.phone && row.consentAt && !row.consentWithdrawnAt) {
      customer = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        phoneHash: row.phoneHash,
      };

      const cardRow = await db.loyaltyCard.findUnique({
        where: {
          restaurantId_customerId: {
            restaurantId: input.restaurantId,
            customerId: row.id,
          },
        },
      });
      card = cardRow ? toCardSnapshot(cardRow) : null;

      const visit = await db.loyaltyVisit.findFirst({
        where: {
          restaurantId: input.restaurantId,
          customerId: row.id,
          businessDate,
        },
        select: { id: true },
      });
      alreadyCounted = visit !== null;
      paidSubtotal = await paidSubtotalForMember(
        db,
        input.restaurantId,
        row.id,
        businessDate
      );
    }
  }

  const billSubtotal = sumMoney(
    input.orders
      .filter(
        (order) =>
          order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED'
      )
      .map((order) => order.subtotalAmount)
  );
  const daySubtotal = customer ? paidSubtotal.plus(billSubtotal) : billSubtotal;
  const rule = toRewardRule(settings);

  return {
    pricing: computeBillPricing({
      billRevision: input.billRevision,
      orders: input.orders,
      promotions: [],
      activeDiscounts,
      settings: rule,
      card,
      customer,
      alreadyCounted,
      daySubtotal,
      cashRounding: restaurant.cashRounding ?? 'NONE',
      now,
    }),
    context: {
      settings: rule,
      restaurant: {
        cashRounding: restaurant.cashRounding,
        timezone: restaurant.timezone,
        businessDayCloseTime: restaurant.businessDayCloseTime,
      },
      customer,
      card,
      businessDate,
      alreadyCounted,
    },
  };
}

/**
 * The §18.20.6 bill projection only. Used by the bill reads and member
 * attach/change; payment uses `projectBillPricing` for the per-order ledger.
 */
export async function projectBill(
  input: ProjectBillInput
): Promise<BillProjection | null> {
  const loaded = await projectBillPricing(input);
  return loaded?.pricing.projection ?? null;
}

/** Load the orders of one dining session for the bill projection. */
export async function loadSessionBillOrders(
  db: TransactionClient,
  restaurantId: string,
  sessionId: string
): Promise<BillOrderRow[]> {
  return db.order.findMany({
    where: { restaurantId, diningSessionId: sessionId },
    select: BILL_ORDER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

// ============================================================================
// MEMBER_CHANGE idempotency
// ============================================================================

const MEMBER_CHANGE_SCOPE = 'MEMBER_CHANGE';
const MEMBER_CHANGE_IN_PROGRESS_MS = 5 * 60 * 1000;
const MEMBER_CHANGE_RETENTION_MS = 24 * 60 * 60 * 1000;

interface MemberChangeRecord {
  status: 'IN_PROGRESS' | 'COMPLETED';
  requestHash: string;
  responseJson: Prisma.JsonValue | null;
  createdAt: Date;
  expiresAt: Date;
}

async function findMemberChangeRecord(
  restaurantId: string,
  key: string,
  now: Date
): Promise<MemberChangeRecord | null> {
  const record = await prisma.idempotencyRecord.findFirst({
    where: {
      restaurantId,
      scope: MEMBER_CHANGE_SCOPE,
      key,
      expiresAt: { gt: now },
    },
    select: {
      status: true,
      requestHash: true,
      responseJson: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return record ?? null;
}

async function clearStaleMemberChangeRecord(
  restaurantId: string,
  key: string,
  now: Date
): Promise<void> {
  const cutoff = new Date(now.getTime() - MEMBER_CHANGE_IN_PROGRESS_MS);
  await prisma.idempotencyRecord.deleteMany({
    where: {
      restaurantId,
      scope: MEMBER_CHANGE_SCOPE,
      key,
      status: 'IN_PROGRESS',
      createdAt: { lt: cutoff },
    },
  });
}

async function startMemberChangeRecord(
  tx: TransactionClient,
  input: {
    restaurantId: string;
    key: string;
    requestHash: string;
    now: Date;
  }
): Promise<void> {
  await tx.idempotencyRecord.create({
    data: {
      restaurantId: input.restaurantId,
      scope: MEMBER_CHANGE_SCOPE,
      key: input.key,
      requestHash: input.requestHash,
      status: 'IN_PROGRESS',
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + MEMBER_CHANGE_RETENTION_MS),
    },
  });
}

async function completeMemberChangeRecord(
  tx: TransactionClient,
  input: {
    restaurantId: string;
    key: string;
    response: Prisma.InputJsonValue;
  }
): Promise<void> {
  await tx.idempotencyRecord.update({
    where: {
      restaurantId_scope_key: {
        restaurantId: input.restaurantId,
        scope: MEMBER_CHANGE_SCOPE,
        key: input.key,
      },
    },
    data: {
      status: 'COMPLETED',
      responseJson: input.response,
    },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

// ============================================================================
// Member attach / remove
// ============================================================================

export type MemberBillTarget =
  | { kind: 'table'; tableId: string }
  | { kind: 'order'; orderId: string };

export interface ChangeMemberInput {
  restaurantId: string;
  target: MemberBillTarget;
  userId: string;
  phone: string;
  name?: string | null;
  consent?: boolean;
  consentVersion?: string | null;
  consentTextHash?: string | null;
  expectedBillRevision: number;
  idempotencyKey: string;
  now?: Date;
}

export interface RemoveMemberInput {
  restaurantId: string;
  target: MemberBillTarget;
  userId: string;
  expectedBillRevision: number;
  idempotencyKey: string;
  now?: Date;
}

export interface MemberChangeResponse {
  status: number;
  body: Record<string, unknown>;
  replayed?: boolean;
}

class MemberBillError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'MemberBillError';
  }
}

function memberError(
  status: number,
  code: string,
  message: string
): MemberChangeResponse {
  return { status, body: { success: false, error: message, code } };
}

function loyaltyDisabled(): MemberChangeResponse {
  return memberError(
    409,
    'LOYALTY_DISABLED',
    'Loyalty is off for this restaurant.'
  );
}

function notFound(): MemberChangeResponse {
  return memberError(404, 'NOT_FOUND', 'Bill not found.');
}

function billPaid(): MemberChangeResponse {
  return memberError(409, 'BILL_PAID', 'This bill is already paid.');
}

function billChanged(): MemberChangeResponse {
  return memberError(
    409,
    'BILL_CHANGED',
    'The bill changed. Reload the bill and try again.'
  );
}

function idempotencyMismatch(): MemberChangeResponse {
  return memberError(
    409,
    'IDEMPOTENCY_MISMATCH',
    'This idempotency key was used for a different request.'
  );
}

function memberChangeRequestHash(input: {
  action: 'attach' | 'remove';
  restaurantId: string;
  target: MemberBillTarget;
  expectedBillRevision: number;
  phone?: string | null;
  name?: string | null;
  consent?: boolean | null;
  consentVersion?: string | null;
  consentTextHash?: string | null;
}): string {
  const payload = JSON.stringify({
    action: input.action,
    restaurantId: input.restaurantId,
    target: input.target,
    expectedBillRevision: input.expectedBillRevision,
    phone: input.phone ?? null,
    name: input.name ?? null,
    consent: input.consent ?? null,
    consentVersion: input.consentVersion ?? null,
    consentTextHash: input.consentTextHash ?? null,
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

type ResolvedBill =
  | { kind: 'not_found' }
  | { kind: 'paid' }
  | {
      kind: 'session';
      sessionId: string;
      billRevision: number;
      customerId: string | null;
      orders: BillOrderRow[];
      lockKey: string;
    }
  | {
      kind: 'order';
      orderId: string;
      billRevision: number;
      customerId: string | null;
      orders: BillOrderRow[];
      lockKey: string;
    };

function allNonCancelledPaid(orders: readonly BillOrderRow[]): boolean {
  const active = orders.filter((order) => order.status !== 'CANCELLED');
  return (
    active.length > 0 && active.every((order) => order.paymentStatus === 'PAID')
  );
}

async function resolveBill(
  db: TransactionClient,
  restaurantId: string,
  target: MemberBillTarget
): Promise<ResolvedBill> {
  if (target.kind === 'table') {
    const table = await db.table.findFirst({
      where: { id: target.tableId, restaurantId },
      select: { id: true },
    });
    if (!table) return { kind: 'not_found' };

    const session = await db.diningSession.findFirst({
      where: { tableId: target.tableId, restaurantId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      select: { id: true, billRevision: true, customerId: true },
    });
    if (!session) return { kind: 'not_found' };

    const orders = await loadSessionBillOrders(db, restaurantId, session.id);
    if (allNonCancelledPaid(orders)) return { kind: 'paid' };

    return {
      kind: 'session',
      sessionId: session.id,
      billRevision: session.billRevision,
      customerId: session.customerId,
      orders,
      lockKey: `loyalty-bill:${restaurantId}:${session.id}`,
    };
  }

  const order = await db.order.findFirst({
    where: { id: target.orderId, restaurantId },
    select: {
      ...BILL_ORDER_SELECT,
      discountVersion: true,
      customerId: true,
      diningSessionId: true,
    },
  });
  if (!order) return { kind: 'not_found' };

  if (order.diningSessionId) {
    const session = await db.diningSession.findFirst({
      where: { id: order.diningSessionId, restaurantId },
      select: { id: true, billRevision: true, customerId: true, tableId: true },
    });
    if (session) {
      const orders = await loadSessionBillOrders(db, restaurantId, session.id);
      if (allNonCancelledPaid(orders)) return { kind: 'paid' };
      return {
        kind: 'session',
        sessionId: session.id,
        billRevision: session.billRevision,
        customerId: session.customerId,
        orders,
        lockKey: `loyalty-bill:${restaurantId}:${session.id}`,
      };
    }
  }

  // A cancelled or refunded order is settled too: writing customerId on it
  // would retroactively re-attribute spend. Use the same typed error as PAID.
  if (
    order.paymentStatus === 'PAID' ||
    order.paymentStatus === 'REFUNDED' ||
    order.status === 'CANCELLED'
  ) {
    return { kind: 'paid' };
  }

  return {
    kind: 'order',
    orderId: order.id,
    billRevision: order.discountVersion,
    customerId: order.customerId,
    orders: [order],
    lockKey: `loyalty-bill:${restaurantId}:${order.id}`,
  };
}

async function acquireBillLock(
  tx: TransactionClient,
  lockKey: string
): Promise<void> {
  // pg_advisory_xact_lock returns void; cast it to text so Prisma can decode it.
  await tx.$queryRaw<Array<{ lock: string }>>`
    SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
  `;
}

async function resolveCounterMember(input: {
  restaurantId: string;
  phone: string;
  name?: string | null;
  consent?: boolean;
  consentVersion?: string | null;
  consentTextHash?: string | null;
  notice: LoyaltyNotice;
}): Promise<{ customerId: string } | { error: MemberChangeResponse }> {
  const phoneResult = normalisePhone(input.phone);
  if (!phoneResult.ok) {
    return {
      error: memberError(422, 'PHONE_INVALID', 'Enter a valid mobile number.'),
    };
  }

  let phoneHash: string;
  try {
    phoneHash = hashPhone(phoneResult.phone);
  } catch {
    return { error: loyaltyDisabled() };
  }

  const existing = await prisma.customer.findFirst({
    where: {
      restaurantId: input.restaurantId,
      phoneHash,
      status: 'ACTIVE',
    },
  });

  // Link an existing ACTIVE, consented customer without asking for the notice
  // proof again. The cashier is attaching a member, not re-consenting them.
  // The name is creation-only (§18.20): renaming an existing member needs
  // `members:pii` and an audit row, which belongs to P6 member management.
  if (existing && existing.consentAt && !existing.consentWithdrawnAt) {
    return { customerId: existing.id };
  }

  if (input.consent !== true) {
    return {
      error: memberError(
        422,
        'CONSENT_REQUIRED',
        'Please agree to the rewards notice to join.'
      ),
    };
  }

  const resolved = await resolveOrCreateCustomer({
    restaurantId: input.restaurantId,
    phone: phoneResult.phone,
    consent: {
      clientVersion: input.consentVersion ?? null,
      clientTextHash: input.consentTextHash ?? null,
    },
    notice: input.notice,
    // Name is creation-only: an existing (for example withdrawn) row keeps its
    // name. Renaming is a P6 member-management action with `members:pii`.
    name: existing ? null : (input.name ?? null),
    source: 'COUNTER',
  });

  if (!resolved.customerId) {
    const code = resolved.loyaltyError?.code ?? 'LOYALTY_DISABLED';
    return {
      error: memberError(
        code === 'LOYALTY_DISABLED' ? 409 : 422,
        code,
        resolved.loyaltyError?.message ?? 'Could not attach the member.'
      ),
    };
  }

  return { customerId: resolved.customerId };
}

async function handleExistingRecord(
  restaurantId: string,
  key: string,
  existing: MemberChangeRecord | null,
  requestHash: string,
  now: Date
): Promise<MemberChangeResponse | null> {
  if (!existing) return null;

  if (existing.requestHash !== requestHash) return idempotencyMismatch();

  if (existing.status === 'COMPLETED') {
    return {
      status: 200,
      body: (existing.responseJson as Record<string, unknown> | null) ?? {
        success: false,
        error: 'The original response is no longer available.',
        code: 'IDEMPOTENCY_MISMATCH',
      },
      replayed: true,
    };
  }

  const age = now.getTime() - new Date(existing.createdAt).getTime();
  if (age < MEMBER_CHANGE_IN_PROGRESS_MS) {
    return memberError(
      409,
      'IDEMPOTENCY_MISMATCH',
      'A request with this idempotency key is in progress.'
    );
  }

  await clearStaleMemberChangeRecord(restaurantId, key, now);
  return null;
}

async function applyMemberChange(input: {
  restaurantId: string;
  target: MemberBillTarget;
  userId: string;
  customerId: string | null;
  expectedBillRevision: number;
  idempotencyKey: string;
  requestHash: string;
  now: Date;
}): Promise<MemberChangeResponse> {
  const pre = await resolveBill(prisma, input.restaurantId, input.target);
  if (pre.kind === 'not_found') return notFound();
  if (pre.kind === 'paid') return billPaid();
  if (pre.billRevision !== input.expectedBillRevision) return billChanged();

  try {
    const body = await prisma.$transaction(async (tx) => {
      await acquireBillLock(tx, pre.lockKey);

      const bill = await resolveBill(tx, input.restaurantId, input.target);
      if (bill.kind === 'not_found') {
        throw new MemberBillError(404, 'NOT_FOUND', 'Bill not found.');
      }
      if (bill.kind === 'paid') {
        throw new MemberBillError(
          409,
          'BILL_PAID',
          'This bill is already paid.'
        );
      }
      if (bill.billRevision !== input.expectedBillRevision) {
        throw new MemberBillError(
          409,
          'BILL_CHANGED',
          'The bill changed. Reload the bill and try again.'
        );
      }

      // Write the idempotency record first: a concurrent duplicate key fails
      // here and rolls back before touching the bill.
      await startMemberChangeRecord(tx, {
        restaurantId: input.restaurantId,
        key: input.idempotencyKey,
        requestHash: input.requestHash,
        now: input.now,
      });

      // Re-attaching the same member (or removing when no member is attached)
      // is a no-op: no revision bump and no audit row, so payment is not forced
      // into an avoidable BILL_CHANGED (R-07). The idempotency record is still
      // written for replay safety.
      const isNoop = bill.customerId === input.customerId;
      const newRevision = isNoop ? bill.billRevision : bill.billRevision + 1;

      if (!isNoop) {
        if (bill.kind === 'session') {
          await tx.diningSession.update({
            where: {
              restaurantId_id: {
                restaurantId: input.restaurantId,
                id: bill.sessionId,
              },
            },
            data: {
              customerId: input.customerId,
              billRevision: newRevision,
            },
          });
          // Only the unpaid bill is re-attributed. A paid order is settled
          // spend: re-writing its customerId would corrupt daySubtotal, member
          // reports and export (§18.20.14 I, §18.20.15 A/D).
          await tx.order.updateMany({
            where: {
              restaurantId: input.restaurantId,
              diningSessionId: bill.sessionId,
              paymentStatus: 'PENDING',
              status: { not: 'CANCELLED' },
            },
            data: { customerId: input.customerId },
          });
        } else {
          await tx.order.update({
            where: {
              restaurantId_id: {
                restaurantId: input.restaurantId,
                id: bill.orderId,
              },
            },
            data: {
              customerId: input.customerId,
              discountVersion: newRevision,
            },
          });
        }

        // Audit is a named mitigation of the accepted no-correction risk
        // (§18.20.15 A). It commits with the bill change.
        await tx.auditLog.create({
          data: {
            tableName: bill.kind === 'session' ? 'dining_sessions' : 'orders',
            recordId: bill.kind === 'session' ? bill.sessionId : bill.orderId,
            operation: 'UPDATE',
            oldValues: { customerId: bill.customerId },
            newValues: {
              customerId: input.customerId,
              billRevision: newRevision,
            },
            changedBy: input.userId,
            restaurantId: input.restaurantId,
            severity: 'info',
            category: 'orders',
            description:
              input.customerId === null
                ? 'Loyalty member removed from bill'
                : 'Loyalty member attached to bill',
            metadata: {
              action:
                input.customerId === null ? 'member_remove' : 'member_attach',
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
      }

      const projection = await projectBill({
        db: tx,
        restaurantId: input.restaurantId,
        orders: bill.orders,
        customerId: input.customerId,
        billRevision: newRevision,
        now: input.now,
      });
      if (!projection) {
        throw new MemberBillError(
          409,
          'LOYALTY_DISABLED',
          'Loyalty is off for this restaurant.'
        );
      }

      const response = { success: true, ...projection };
      await completeMemberChangeRecord(tx, {
        restaurantId: input.restaurantId,
        key: input.idempotencyKey,
        response: response as unknown as Prisma.InputJsonValue,
      });

      return response;
    });

    return { status: 200, body };
  } catch (error) {
    if (error instanceof MemberBillError) {
      return memberError(error.status, error.code, error.message);
    }
    if (isUniqueConstraintError(error)) {
      const raced = await findMemberChangeRecord(
        input.restaurantId,
        input.idempotencyKey,
        input.now
      );
      if (raced?.status === 'COMPLETED') {
        return {
          status: 200,
          body: (raced.responseJson as Record<string, unknown> | null) ?? {
            success: false,
            error: 'The original response is no longer available.',
            code: 'IDEMPOTENCY_MISMATCH',
          },
          replayed: true,
        };
      }
      return memberError(
        409,
        'IDEMPOTENCY_MISMATCH',
        'A request with this idempotency key is in progress.'
      );
    }
    throw error;
  }
}

/**
 * Attach or change the member of a dine-in session or a takeaway order.
 *
 * The member must be an existing ACTIVE, consented customer, or the call must
 * carry a valid server-notice consent proof. Missing/stale consent leaves the
 * bill unchanged and returns `CONSENT_REQUIRED`/`CONSENT_STALE`.
 */
export async function changeMember(
  input: ChangeMemberInput
): Promise<MemberChangeResponse> {
  const now = input.now ?? new Date();

  if (!isLoyaltyGloballyEnabled()) return loyaltyDisabled();

  const normalised = normalisePhone(input.phone);
  const requestHash = memberChangeRequestHash({
    action: 'attach',
    restaurantId: input.restaurantId,
    target: input.target,
    expectedBillRevision: input.expectedBillRevision,
    phone: normalised.ok ? normalised.phone : input.phone,
    name: input.name ?? null,
    consent: input.consent ?? null,
    consentVersion: input.consentVersion ?? null,
    consentTextHash: input.consentTextHash ?? null,
  });

  const existing = await findMemberChangeRecord(
    input.restaurantId,
    input.idempotencyKey,
    now
  );
  const early = await handleExistingRecord(
    input.restaurantId,
    input.idempotencyKey,
    existing,
    requestHash,
    now
  );
  if (early) return early;

  const settings = await prisma.loyaltySettings.findUnique({
    where: { restaurantId: input.restaurantId },
  });
  if (!isLoyaltyActive(settings)) return loyaltyDisabled();

  const notice = resolveNotice(settings);
  if (!notice) return loyaltyDisabled();

  // Check the revision before capturing consent. The authoritative check is
  // repeated under the bill lock below.
  const pre = await resolveBill(prisma, input.restaurantId, input.target);
  if (pre.kind === 'not_found') return notFound();
  if (pre.kind === 'paid') return billPaid();
  if (pre.billRevision !== input.expectedBillRevision) return billChanged();

  const member = await resolveCounterMember({
    restaurantId: input.restaurantId,
    phone: input.phone,
    name: input.name,
    consent: input.consent,
    consentVersion: input.consentVersion,
    consentTextHash: input.consentTextHash,
    notice,
  });
  if ('error' in member) return member.error;

  return applyMemberChange({
    restaurantId: input.restaurantId,
    target: input.target,
    userId: input.userId,
    customerId: member.customerId,
    expectedBillRevision: input.expectedBillRevision,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    now,
  });
}

/** Remove the member from a dine-in session or a takeaway order. */
export async function removeMember(
  input: RemoveMemberInput
): Promise<MemberChangeResponse> {
  const now = input.now ?? new Date();

  if (!isLoyaltyGloballyEnabled()) return loyaltyDisabled();

  const requestHash = memberChangeRequestHash({
    action: 'remove',
    restaurantId: input.restaurantId,
    target: input.target,
    expectedBillRevision: input.expectedBillRevision,
  });

  const existing = await findMemberChangeRecord(
    input.restaurantId,
    input.idempotencyKey,
    now
  );
  const early = await handleExistingRecord(
    input.restaurantId,
    input.idempotencyKey,
    existing,
    requestHash,
    now
  );
  if (early) return early;

  const settings = await prisma.loyaltySettings.findUnique({
    where: { restaurantId: input.restaurantId },
  });
  if (!isLoyaltyActive(settings)) return loyaltyDisabled();
  if (!resolveNotice(settings)) return loyaltyDisabled();

  return applyMemberChange({
    restaurantId: input.restaurantId,
    target: input.target,
    userId: input.userId,
    customerId: null,
    expectedBillRevision: input.expectedBillRevision,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    now,
  });
}
