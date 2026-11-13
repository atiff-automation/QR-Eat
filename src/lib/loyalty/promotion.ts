import Decimal from 'decimal.js';
import { floor2, sumMoney, type MoneyInput } from './money';

export type PromotionType = 'PERCENT' | 'FIXED';
export type PromotionScope = 'ORDER' | 'CATEGORY' | 'ITEM';

export interface PromotionLine {
  itemId: string;
  categoryId: string | null;
  name: string;
  lineTotal: MoneyInput;
}

/**
 * A promotion candidate. The caller resolves it from the database; this module
 * never performs I/O. `categoryIds`/`itemIds` are already resolved membership
 * lists (join tables in the data model).
 */
export interface PromotionCandidate {
  id: string;
  name: string;
  receiptLabel?: string | null;
  type: PromotionType;
  value: MoneyInput;
  scope: PromotionScope;
  categoryIds: readonly string[];
  itemIds: readonly string[];
  minSpend: MoneyInput;
  maxDiscount: MoneyInput;
  startsAt: Date | string;
  endsAt: Date | string;
  isActive: boolean;
}

export interface EvaluatePromotionInput {
  lines: readonly PromotionLine[];
  promotions: readonly PromotionCandidate[];
  /** The order time. Defaults to now; tests pass it explicitly. */
  at?: Date;
}

export interface PromotionEligibleItem {
  itemId: string;
  name: string;
  lineTotal: Decimal;
}

export interface PromotionResult {
  applied: boolean;
  promotionId: string | null;
  promotionName: string | null;
  label: string | null;
  scope: PromotionScope | null;
  eligibleBase: Decimal;
  discountAmount: Decimal;
  /**
   * Eligible items for copy. Always empty for `ORDER` scope, per §18.20.15 E;
   * category scope resolves to its eligible items.
   */
  items: PromotionEligibleItem[];
  /** True when a CATEGORY/ITEM promotion covers only part of the order. */
  partialOrder: boolean;
}

interface CandidateEvaluation {
  candidate: PromotionCandidate;
  items: PromotionLine[];
  base: Decimal;
  discount: Decimal;
}

function isWithinWindow(candidate: PromotionCandidate, at: Date): boolean {
  const startsAt = new Date(candidate.startsAt).getTime();
  const endsAt = new Date(candidate.endsAt).getTime();
  const orderTime = at.getTime();

  if (
    Number.isNaN(startsAt) ||
    Number.isNaN(endsAt) ||
    Number.isNaN(orderTime)
  ) {
    return false;
  }

  // Half-open window: active from `startsAt` up to, but not including, `endsAt`.
  return orderTime >= startsAt && orderTime < endsAt;
}

function eligibleLines(
  candidate: PromotionCandidate,
  lines: readonly PromotionLine[]
): PromotionLine[] {
  switch (candidate.scope) {
    case 'ORDER':
      return [...lines];
    case 'CATEGORY': {
      const categoryIds = new Set(candidate.categoryIds);
      return lines.filter(
        (line) => line.categoryId !== null && categoryIds.has(line.categoryId)
      );
    }
    case 'ITEM': {
      const itemIds = new Set(candidate.itemIds);
      return lines.filter((line) => itemIds.has(line.itemId));
    }
  }
}

function evaluateCandidate(
  candidate: PromotionCandidate,
  lines: readonly PromotionLine[]
): CandidateEvaluation | null {
  const items = eligibleLines(candidate, lines);
  // Money is 2dp at the persistence boundary. Floor the eligible base too, so
  // a 3dp line total cannot leak a 3dp `baseAmount`/`amount` into the ledger.
  const base = floor2(sumMoney(items.map((item) => item.lineTotal)));

  if (base.lte(0)) return null;
  if (base.lt(new Decimal(candidate.minSpend))) return null;

  const value = new Decimal(candidate.value);
  const rawDiscount =
    candidate.type === 'PERCENT'
      ? base.times(value).dividedBy(100)
      : Decimal.min(value, base);
  const cappedDiscount = Decimal.min(
    rawDiscount,
    Decimal.max(0, new Decimal(candidate.maxDiscount))
  );
  // Defence in depth: the DB CHECK prevents percent > 100, but the engine must
  // never emit a discount larger than the eligible base.
  const discount = Decimal.min(floor2(cappedDiscount), base);

  if (discount.lte(0)) return null;

  return { candidate, items, base, discount };
}

/**
 * Evaluate candidate promotions for one order and return the single best
 * discount. No stacking. Ties are broken by highest discount, then lowest
 * promotion id (lexicographic).
 *
 * The active window is half-open: `startsAt <= at < endsAt`. P6 must store an
 * end-of-day `endsAt` (for example 23:59:59.999 in the restaurant timezone) so
 * the promotion's final day is not excluded.
 */
export function evaluatePromotion(
  input: EvaluatePromotionInput
): PromotionResult {
  const at = input.at ?? new Date();
  let best: CandidateEvaluation | null = null;

  for (const candidate of input.promotions) {
    if (!candidate.isActive) continue;
    if (!isWithinWindow(candidate, at)) continue;

    const evaluation = evaluateCandidate(candidate, input.lines);
    if (evaluation === null) continue;

    if (
      best === null ||
      evaluation.discount.gt(best.discount) ||
      (evaluation.discount.eq(best.discount) &&
        evaluation.candidate.id < best.candidate.id)
    ) {
      best = evaluation;
    }
  }

  if (best === null) {
    return {
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
  }

  const items =
    best.candidate.scope === 'ORDER'
      ? []
      : best.items.map((item) => ({
          itemId: item.itemId,
          name: item.name,
          lineTotal: new Decimal(item.lineTotal),
        }));

  return {
    applied: true,
    promotionId: best.candidate.id,
    promotionName: best.candidate.name,
    label: best.candidate.receiptLabel ?? best.candidate.name,
    scope: best.candidate.scope,
    eligibleBase: best.base,
    discountAmount: best.discount,
    items,
    partialOrder:
      best.candidate.scope !== 'ORDER' &&
      best.items.length < input.lines.length,
  };
}
