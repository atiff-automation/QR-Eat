import Decimal from 'decimal.js';
import { floor2, type MoneyInput } from './money';

export type RewardType = 'PERCENT' | 'FIXED';

/**
 * The reward rule snapshot. A card keeps the rule it started its cycle with; a
 * customer without a card uses the current settings until the first visit
 * snapshots them.
 */
export interface RewardRule {
  visitsRequired: number;
  rewardType: RewardType;
  rewardValue: MoneyInput;
  maxDiscount: MoneyInput;
  rewardLabel: string;
  minDailySpend: MoneyInput;
}

export interface RewardCardSnapshot extends RewardRule {
  visitsInCycle: number;
  cycleNumber: number;
}

export interface ProjectRewardInput {
  /** The bill subtotal the reward is calculated from. */
  subtotal: MoneyInput;
  /** `null` before the first card exists; settings decide in that case. */
  card: RewardCardSnapshot | null;
  settings: RewardRule;
  /**
   * True when the bill already has an applied promotion. A promotion and a
   * reward never coexist, so a promotion bill projects `0.00`.
   */
  hasPromotion: boolean;
  /** Overrides the card count when the caller holds a fresher value. */
  completedVisits?: number;
}

export interface RewardProjection {
  amount: Decimal;
  /** Whether a non-zero reward is projected for this visit. */
  applies: boolean;
  label: string;
  visitsRequired: number;
  /** The visit count before this visit, or the caller's override. */
  completedVisits: number;
}

/**
 * Project the reward for a qualifying visit.
 *
 * `PERCENT` is floored to 2dp and capped by `maxDiscount`. `FIXED` is
 * `min(value, subtotal, maxDiscount)`. `maxDiscount` caps both reward types.
 * In all cases the amount is floored to 2dp, never negative and never above the
 * subtotal. A non-qualifying visit, a zero amount, or a bill with an applied
 * promotion projects `0.00` with `applies: false`.
 */
export function projectReward(input: ProjectRewardInput): RewardProjection {
  const rule = input.card ?? input.settings;
  const completedVisits =
    input.completedVisits ?? input.card?.visitsInCycle ?? 0;
  const visitsRequired = rule.visitsRequired;
  const qualifies =
    !input.hasPromotion && completedVisits + 1 >= visitsRequired;
  const subtotal = Decimal.max(0, new Decimal(input.subtotal));

  if (!qualifies || subtotal.isZero()) {
    return {
      amount: new Decimal(0),
      applies: false,
      label: rule.rewardLabel,
      visitsRequired,
      completedVisits,
    };
  }

  const value = new Decimal(rule.rewardValue);
  const rawAmount =
    rule.rewardType === 'PERCENT'
      ? subtotal.times(value).dividedBy(100)
      : Decimal.min(value, subtotal);
  const cappedAmount = Decimal.min(
    rawAmount,
    Decimal.max(0, new Decimal(rule.maxDiscount))
  );
  const amount = Decimal.max(0, Decimal.min(floor2(cappedAmount), subtotal));

  return {
    amount,
    applies: amount.gt(0),
    label: rule.rewardLabel,
    visitsRequired,
    completedVisits,
  };
}

export interface RewardAllocationOrder {
  orderId: string;
  subtotal: MoneyInput;
  /** True when the order already carries an ACTIVE promotion discount. */
  hasPromotionDiscount?: boolean;
}

export interface RewardAllocation {
  orderId: string;
  amount: Decimal;
}

export class RewardAllocationError extends Error {
  readonly code = 'DISCOUNT_ALLOCATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'RewardAllocationError';
  }
}

const ONE_SEN = new Decimal('0.01');

interface AllocationEntry {
  order: RewardAllocationOrder;
  subtotal: Decimal;
  amount: Decimal;
}

/**
 * Allocate a bill-level reward across orders.
 *
 * Each order receives `floor2(reward * subtotal / eligibleTotal)`; order
 * subtotals are first floored to 2dp, then the remainder is distributed in
 * one-sen steps to orders with headroom, ordered by subtotal descending then
 * order id. A promotion and a reward never coexist on a bill, so an order
 * carrying a promotion discount rejects a positive reward.
 */
export function allocateReward(input: {
  rewardAmount: MoneyInput;
  orders: readonly RewardAllocationOrder[];
}): RewardAllocation[] {
  const reward = new Decimal(input.rewardAmount);

  if (reward.isNegative()) {
    throw new RewardAllocationError('rewardAmount must not be negative');
  }
  if (reward.decimalPlaces() > 2) {
    throw new RewardAllocationError(
      'rewardAmount must be a two-decimal money value'
    );
  }

  if (reward.isZero()) {
    return input.orders.map((order) => ({
      orderId: order.orderId,
      amount: new Decimal(0),
    }));
  }

  if (input.orders.some((order) => order.hasPromotionDiscount)) {
    throw new RewardAllocationError(
      'a promotion and a loyalty reward never coexist'
    );
  }

  const entries: AllocationEntry[] = input.orders
    .map((order) => ({
      order,
      subtotal: floor2(Decimal.max(0, new Decimal(order.subtotal))),
      amount: new Decimal(0),
    }))
    .filter((entry) => entry.subtotal.gt(0));

  const eligibleTotal = entries.reduce(
    (sum, entry) => sum.plus(entry.subtotal),
    new Decimal(0)
  );

  if (eligibleTotal.lte(0)) {
    throw new RewardAllocationError('no order subtotal to allocate against');
  }
  if (reward.gt(eligibleTotal)) {
    throw new RewardAllocationError('reward exceeds the allocatable subtotal');
  }

  for (const entry of entries) {
    entry.amount = floor2(
      reward.times(entry.subtotal).dividedBy(eligibleTotal)
    );
  }

  let remainder = reward.minus(
    entries.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0))
  );

  const byHeadroom = [...entries].sort((left, right) => {
    const bySubtotal = right.subtotal.cmp(left.subtotal);
    if (bySubtotal !== 0) return bySubtotal;
    if (left.order.orderId < right.order.orderId) return -1;
    if (left.order.orderId > right.order.orderId) return 1;
    return 0;
  });

  while (remainder.gt(0)) {
    let placed = false;

    for (const entry of byHeadroom) {
      if (remainder.lte(0)) break;

      const headroom = floor2(entry.subtotal.minus(entry.amount));
      if (headroom.lte(0)) continue;

      const step = Decimal.min(ONE_SEN, remainder, headroom);
      entry.amount = entry.amount.plus(step);
      remainder = remainder.minus(step);
      placed = true;
    }

    if (!placed) {
      throw new RewardAllocationError(
        'could not allocate the full reward within order headroom'
      );
    }
  }

  const allocated = entries.reduce(
    (sum, entry) => sum.plus(entry.amount),
    new Decimal(0)
  );

  if (!allocated.eq(reward)) {
    throw new RewardAllocationError('allocation does not equal the reward');
  }
  for (const entry of entries) {
    if (entry.amount.gt(entry.subtotal)) {
      throw new RewardAllocationError('allocation exceeds an order subtotal');
    }
  }

  const amountsByOrder = new Map<string, Decimal>();
  for (const entry of entries) {
    amountsByOrder.set(entry.order.orderId, entry.amount);
  }

  return input.orders.map((order) => ({
    orderId: order.orderId,
    amount: amountsByOrder.get(order.orderId) ?? new Decimal(0),
  }));
}
