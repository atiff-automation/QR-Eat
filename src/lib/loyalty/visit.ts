import Decimal from 'decimal.js';
import type { MoneyInput } from './money';

export type VisitState =
  | 'COUNTS'
  | 'ALREADY_COUNTED'
  | 'PROMOTION'
  | 'BELOW_MINIMUM'
  | 'GUEST';

export type LoyaltyOutcome =
  | 'VISIT_COUNTED'
  | 'REWARD_APPLIED'
  | 'PROMOTION_APPLIED'
  | 'BELOW_MINIMUM'
  | 'ALREADY_COUNTED'
  | 'GUEST'
  | 'NO_BENEFIT';

export interface VisitStateInput {
  hasMember: boolean;
  hasConsent: boolean;
  hasPromotion: boolean;
  alreadyCounted: boolean;
  daySubtotal: MoneyInput;
  minDailySpend: MoneyInput;
}

/**
 * Resolve the visit state for the QR quote and the bill read.
 *
 * Precedence (§18.20.15 E):
 * `GUEST > PROMOTION > ALREADY_COUNTED > BELOW_MINIMUM > COUNTS`.
 */
export function resolveVisitState(input: VisitStateInput): VisitState {
  if (!input.hasMember || !input.hasConsent) return 'GUEST';
  if (input.hasPromotion) return 'PROMOTION';
  if (input.alreadyCounted) return 'ALREADY_COUNTED';
  if (new Decimal(input.daySubtotal).lt(new Decimal(input.minDailySpend))) {
    return 'BELOW_MINIMUM';
  }
  return 'COUNTS';
}

export interface OutcomeInput {
  hasMember: boolean;
  hasConsent: boolean;
  hasPromotion: boolean;
  rewardApplied: boolean;
  visitCounted: boolean;
  alreadyCounted: boolean;
  belowMinimum: boolean;
}

/**
 * Resolve the payment outcome.
 *
 * Precedence (§18.20.15 E):
 * `PROMOTION_APPLIED > REWARD_APPLIED > VISIT_COUNTED > ALREADY_COUNTED >
 * BELOW_MINIMUM > GUEST > NO_BENEFIT`.
 *
 * This is the low-level resolver. Prefer `resolveVisitOutcome` so
 * `belowMinimum` is derived from the same state as `visitState`; otherwise a
 * guest can be turned into `BELOW_MINIMUM` or a member below the minimum into
 * `NO_BENEFIT`.
 *
 * A guest bill with a promotion therefore has `visitState=GUEST` but
 * `outcome=PROMOTION_APPLIED`.
 */
export function resolveOutcome(input: OutcomeInput): LoyaltyOutcome {
  if (input.hasPromotion) return 'PROMOTION_APPLIED';
  if (input.rewardApplied) return 'REWARD_APPLIED';
  if (input.visitCounted) return 'VISIT_COUNTED';
  if (input.alreadyCounted) return 'ALREADY_COUNTED';
  if (input.belowMinimum) return 'BELOW_MINIMUM';
  if (!input.hasMember || !input.hasConsent) return 'GUEST';
  return 'NO_BENEFIT';
}

export interface VisitOutcomeInput {
  hasMember: boolean;
  hasConsent: boolean;
  hasPromotion: boolean;
  rewardApplied: boolean;
  alreadyCounted: boolean;
  daySubtotal: MoneyInput;
  minDailySpend: MoneyInput;
}

export interface VisitOutcomeResult {
  visitState: VisitState;
  outcome: LoyaltyOutcome;
}

/**
 * The combined visit/outcome resolver callers should use.
 *
 * `belowMinimum` and `visitCounted` are derived from `visitState`, so the two
 * values cannot disagree. In particular a guest never becomes
 * `BELOW_MINIMUM`, and a member below the minimum never becomes `NO_BENEFIT`.
 */
export function resolveVisitOutcome(
  input: VisitOutcomeInput
): VisitOutcomeResult {
  const visitState = resolveVisitState(input);

  return {
    visitState,
    outcome: resolveOutcome({
      hasMember: input.hasMember,
      hasConsent: input.hasConsent,
      hasPromotion: input.hasPromotion,
      rewardApplied: input.rewardApplied,
      visitCounted: visitState === 'COUNTS',
      alreadyCounted: input.alreadyCounted,
      belowMinimum: visitState === 'BELOW_MINIMUM',
    }),
  };
}

export interface NextCardStateInput {
  visitsInCycle: number;
  visitsRequired: number;
}

export interface NextCardState {
  /** The counting visit increments the card without resetting it. */
  increments: boolean;
  /** The counting visit completes the cycle and resets the card to 0. */
  resets: boolean;
  /** The reward applies on this visit. */
  rewardApplies: boolean;
}

/**
 * Resolve the card mutation for a visit that counts.
 *
 * A reward visit resets the card and starts the next cycle; it does not leave
 * an intermediate `visitsInCycle === visitsRequired` value behind.
 */
export function nextCardState(input: NextCardStateInput): NextCardState {
  const { visitsInCycle, visitsRequired } = input;

  if (!Number.isInteger(visitsRequired) || visitsRequired < 1) {
    throw new RangeError('visitsRequired must be a positive integer');
  }
  if (
    !Number.isInteger(visitsInCycle) ||
    visitsInCycle < 0 ||
    visitsInCycle >= visitsRequired
  ) {
    throw new RangeError(
      'visitsInCycle must satisfy 0 <= visitsInCycle < visitsRequired'
    );
  }

  const rewardApplies = visitsInCycle + 1 >= visitsRequired;

  return {
    increments: !rewardApplies,
    resets: rewardApplies,
    rewardApplies,
  };
}
