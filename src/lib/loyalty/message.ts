import { toMoneyString, type MoneyInput } from './money';
import type { PromotionScope } from './promotion';
import type { LoyaltyOutcome, VisitState } from './visit';

export type CopyPromotionScope = PromotionScope | 'MULTIPLE';

export interface LoyaltyCopyItem {
  itemId?: string;
  name: string;
}

/**
 * Values supplied by the server from the card/bill snapshot. No copy builder
 * hardcodes a visit count, reward value or minimum spend.
 */
export interface LoyaltyCopyContext {
  visitState: VisitState;
  outcome?: LoyaltyOutcome | null;
  completedVisits?: number | null;
  visitsRequired?: number | null;
  rewardLabel?: string | null;
  rewardApplied?: boolean;
  promotionScope?: CopyPromotionScope | null;
  promotionLabel?: string | null;
  promotionItems?: readonly LoyaltyCopyItem[];
  minDailySpend?: MoneyInput | null;
  amountToMinimum?: MoneyInput | null;
  /** QR preview with no phone entered. */
  noPhone?: boolean;
  loyaltyDisabled?: boolean;
  loyaltyErrorCode?: string | null;
  currency?: string;
}

const DISABLED_MESSAGE = 'Loyalty is off for this restaurant.';
const GENERIC_LOYALTY_ERROR_MESSAGE =
  'Could not add rewards. Staff can help at the counter.';
const PHONE_INVALID_MESSAGE =
  'Enter a valid mobile number (e.g. +60123456789); the client normalises spaces/hyphens to E.164.';
const CONSENT_REQUIRED_MESSAGE = 'Please agree to the rewards notice to join.';
const CONSENT_STALE_MESSAGE =
  'The rewards notice changed. Review and agree again.';
const CONSENT_VERSION_REQUIRED_MESSAGE =
  'Review the rewards notice before joining.';
const NO_PHONE_MESSAGE = 'Earn a visit. Add your mobile number.';
const ALREADY_COUNTED_MESSAGE = "Today's visit is already counted.";
const QR_BELOW_MINIMUM_MESSAGE =
  'This visit needs the minimum daily spend. Staff can help at the counter.';
const PAYMENT_BELOW_MINIMUM_MESSAGE =
  'Visit not counted; minimum daily spend not met.';
const GUEST_QR_MESSAGE =
  'Guest order - no visit tracked; staff can attach at the counter.';
const GUEST_PAYMENT_MESSAGE = 'Guest order - no visit tracked.';
const QR_RATE_LIMITED_MESSAGE =
  'Please order at the counter — our staff will help.';

function currencyOf(context: LoyaltyCopyContext): string {
  return context.currency ?? 'RM';
}

function isLoyaltyDisabled(context: LoyaltyCopyContext): boolean {
  return (
    context.loyaltyDisabled === true ||
    context.loyaltyErrorCode === 'LOYALTY_DISABLED'
  );
}

function moneyText(
  value: MoneyInput | null | undefined,
  currency: string
): string | null {
  if (value === null || value === undefined) return null;
  return `${currency}${toMoneyString(value)}`;
}

function progressText(context: LoyaltyCopyContext): string | null {
  const { completedVisits, visitsRequired } = context;
  if (
    completedVisits === null ||
    completedVisits === undefined ||
    visitsRequired === null ||
    visitsRequired === undefined
  ) {
    return null;
  }
  return `${completedVisits} of ${visitsRequired}`;
}

function formatItemList(items: readonly LoyaltyCopyItem[]): string | null {
  const names = items
    .map((item) => item.name.trim())
    .filter((name) => name.length > 0);

  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function promotionTarget(context: LoyaltyCopyContext): string | null {
  if (context.promotionScope === 'ORDER') return 'this order';
  return formatItemList(context.promotionItems ?? []);
}

function promotionLabel(context: LoyaltyCopyContext): string {
  const label = context.promotionLabel?.trim();
  return label && label.length > 0 ? label : 'Promotion';
}

function hasPromotion(context: LoyaltyCopyContext): boolean {
  return (
    (context.promotionScope !== null && context.promotionScope !== undefined) ||
    (context.promotionItems?.length ?? 0) > 0 ||
    context.outcome === 'PROMOTION_APPLIED' ||
    Boolean(context.promotionLabel)
  );
}

function qrErrorMessage(context: LoyaltyCopyContext): string {
  switch (context.loyaltyErrorCode) {
    case 'PHONE_INVALID':
      return PHONE_INVALID_MESSAGE;
    case 'CONSENT_REQUIRED':
      return CONSENT_REQUIRED_MESSAGE;
    case 'CONSENT_STALE':
      return CONSENT_STALE_MESSAGE;
    case 'CONSENT_VERSION_REQUIRED':
      return CONSENT_VERSION_REQUIRED_MESSAGE;
    case 'RATE_LIMITED':
      // A refused QR customer is sent to the counter. The retry window is not
      // customer copy: a refusal is not a transient error they can repeat.
      return QR_RATE_LIMITED_MESSAGE;
    case 'LOYALTY_DISABLED':
      return DISABLED_MESSAGE;
    default:
      return GENERIC_LOYALTY_ERROR_MESSAGE;
  }
}

interface PromotionLead {
  text: string;
  target: string | null;
}

function promotionLead(context: LoyaltyCopyContext): PromotionLead {
  const target = promotionTarget(context);

  if (context.promotionScope === 'MULTIPLE') {
    return {
      text: target
        ? `${promotionLabel(context)} applied to ${target}`
        : `${promotionLabel(context)} applied`,
      target,
    };
  }

  if (context.promotionScope === 'ORDER' || target === null) {
    return {
      text: `${promotionLabel(context)} applied to this order`,
      target: 'this order',
    };
  }

  return {
    text: `${promotionLabel(context)} applied to ${target}`,
    target,
  };
}

function toAscii(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

function countsMessage(context: LoyaltyCopyContext, lead: string): string {
  const progress = progressText(context);
  return progress ? `${lead}: ${progress}.` : `${lead}.`;
}

function rewardMessage(context: LoyaltyCopyContext): string | null {
  const label = context.rewardLabel?.trim();
  return label && label.length > 0 ? `${label} applied; card resets.` : null;
}

function quotePromotionMessage(context: LoyaltyCopyContext): string {
  if (context.visitState === 'GUEST') {
    return 'Promotion applied. No visit tracked.';
  }

  const { text, target } = promotionLead(context);
  const progress = progressText(context);
  const cardClause = progress
    ? ` Your card stays at ${progress}; your progress and any reward remain available for a later non-promotion visit.`
    : '';
  const removeClause =
    context.promotionScope !== 'ORDER' &&
    context.promotionScope !== 'MULTIPLE' &&
    target !== 'this order'
      ? ` Remove ${target} to let the visit count.`
      : '';

  return `${text}. This visit will not count.${cardClause}${removeClause}`;
}

function billPromotionMessage(context: LoyaltyCopyContext): string {
  if (context.visitState === 'GUEST') {
    return 'Promotion applied. No visit tracked.';
  }

  const { text, target } = promotionLead(context);
  const progress = progressText(context);
  const cardClause = progress
    ? ` Visit not counted; card remains at ${progress}.`
    : ' Visit not counted.';
  const removeClause =
    context.promotionScope !== 'ORDER' &&
    context.promotionScope !== 'MULTIPLE' &&
    target !== 'this order'
      ? ` Remove ${target} to let the visit count.`
      : '';

  return `${text}.${cardClause}${removeClause}`;
}

function paymentPromotionMessage(context: LoyaltyCopyContext): string {
  if (context.visitState === 'GUEST') {
    return 'Promotion applied. No visit tracked.';
  }

  const progress = progressText(context);

  if (context.promotionScope === 'MULTIPLE') {
    const { text } = promotionLead(context);
    return progress
      ? `${text}; visit not counted; card stays at ${progress}.`
      : `${text}; visit not counted.`;
  }

  return progress
    ? `Promotion applied; visit not counted; card stays at ${progress}.`
    : 'Promotion applied; visit not counted.';
}

function receiptPromotionMessage(context: LoyaltyCopyContext): string {
  if (context.visitState === 'GUEST') {
    return 'Promotion applied. No visit tracked.';
  }

  const { text } = promotionLead(context);
  const progress = progressText(context);
  const cardClause = progress
    ? `card remains at ${progress}; progress and reward remain for a later non-promotion visit.`
    : 'card unchanged.';

  return `${text}. Visit not counted; ${cardClause}`;
}

function counterBelowMinimumMessage(context: LoyaltyCopyContext): string {
  const currency = currencyOf(context);
  const amountToMinimum = moneyText(context.amountToMinimum, currency);
  if (amountToMinimum) {
    return `Spend ${amountToMinimum} more today to make this visit count.`;
  }

  const minimum = moneyText(context.minDailySpend, currency);
  if (minimum) {
    return `Minimum daily spend is ${minimum}.`;
  }

  return 'This visit needs the minimum daily spend.';
}

/** Loyalty message for the QR review/quote response. */
export function buildQuoteMessage(context: LoyaltyCopyContext): string | null {
  // A disabled restaurant never shows loyalty or promotion copy.
  if (isLoyaltyDisabled(context)) return DISABLED_MESSAGE;

  // An applied promotion wins over the phone prompt and error copy: the
  // promotion still applies, and the contract guest copy is
  // "Promotion applied. No visit tracked."
  if (
    context.visitState === 'PROMOTION' ||
    (context.visitState === 'GUEST' && hasPromotion(context))
  ) {
    return quotePromotionMessage(context);
  }

  if (context.loyaltyErrorCode) {
    return qrErrorMessage(context);
  }

  if (context.noPhone) return NO_PHONE_MESSAGE;

  switch (context.visitState) {
    case 'ALREADY_COUNTED':
      return ALREADY_COUNTED_MESSAGE;
    case 'BELOW_MINIMUM':
      return QR_BELOW_MINIMUM_MESSAGE;
    case 'GUEST':
      return GUEST_QR_MESSAGE;
    case 'COUNTS': {
      if (context.rewardApplied) {
        return (
          rewardMessage(context) ?? countsMessage(context, 'This visit counts')
        );
      }
      return countsMessage(context, 'This visit counts');
    }
  }
}

/** Loyalty message for the Counter bill read. */
export function buildBillMessage(context: LoyaltyCopyContext): string | null {
  if (isLoyaltyDisabled(context)) return DISABLED_MESSAGE;

  if (
    context.visitState === 'PROMOTION' ||
    (context.visitState === 'GUEST' && hasPromotion(context))
  ) {
    return billPromotionMessage(context);
  }

  switch (context.visitState) {
    case 'ALREADY_COUNTED':
      return ALREADY_COUNTED_MESSAGE;
    case 'BELOW_MINIMUM':
      return counterBelowMinimumMessage(context);
    case 'GUEST':
      return GUEST_QR_MESSAGE;
    case 'COUNTS': {
      if (context.rewardApplied) {
        return (
          rewardMessage(context) ?? countsMessage(context, 'Visit counted')
        );
      }
      return countsMessage(context, 'Visit counted');
    }
  }
}

/** Loyalty message for the payment result. */
export function buildPaymentResultMessage(
  context: LoyaltyCopyContext
): string | null {
  if (isLoyaltyDisabled(context)) return DISABLED_MESSAGE;

  if (context.outcome) {
    switch (context.outcome) {
      case 'PROMOTION_APPLIED':
        return paymentPromotionMessage(context);
      case 'REWARD_APPLIED':
        return rewardMessage(context) ?? 'Reward applied; card resets.';
      case 'VISIT_COUNTED':
        return countsMessage(context, 'Visit counted');
      case 'ALREADY_COUNTED':
        return ALREADY_COUNTED_MESSAGE;
      case 'BELOW_MINIMUM':
        return PAYMENT_BELOW_MINIMUM_MESSAGE;
      case 'GUEST':
        return GUEST_PAYMENT_MESSAGE;
      case 'NO_BENEFIT':
        return null;
    }
  }

  if (
    context.visitState === 'PROMOTION' ||
    (context.visitState === 'GUEST' && hasPromotion(context))
  ) {
    return paymentPromotionMessage(context);
  }

  switch (context.visitState) {
    case 'ALREADY_COUNTED':
      return ALREADY_COUNTED_MESSAGE;
    case 'BELOW_MINIMUM':
      return PAYMENT_BELOW_MINIMUM_MESSAGE;
    case 'GUEST':
      return GUEST_PAYMENT_MESSAGE;
    case 'COUNTS':
      return context.rewardApplied
        ? (rewardMessage(context) ?? countsMessage(context, 'Visit counted'))
        : countsMessage(context, 'Visit counted');
  }
}

function buildReceiptMessageRaw(context: LoyaltyCopyContext): string | null {
  if (isLoyaltyDisabled(context)) return DISABLED_MESSAGE;

  if (
    context.visitState === 'PROMOTION' ||
    (context.visitState === 'GUEST' && hasPromotion(context))
  ) {
    return receiptPromotionMessage(context);
  }

  switch (context.visitState) {
    case 'ALREADY_COUNTED':
      return ALREADY_COUNTED_MESSAGE;
    case 'BELOW_MINIMUM':
      return PAYMENT_BELOW_MINIMUM_MESSAGE;
    case 'GUEST':
      return GUEST_PAYMENT_MESSAGE;
    case 'COUNTS':
      return context.rewardApplied
        ? (rewardMessage(context) ?? countsMessage(context, 'Visit counted'))
        : countsMessage(context, 'Visit counted');
  }
}

/**
 * ASCII-only loyalty message for the receipt.
 *
 * Receipts transliterate to ASCII: diacritics are removed with NFKD, and any
 * remaining non-ASCII character becomes `?`.
 */
export function buildReceiptMessage(
  context: LoyaltyCopyContext
): string | null {
  const message = buildReceiptMessageRaw(context);
  return message === null ? null : toAscii(message);
}
