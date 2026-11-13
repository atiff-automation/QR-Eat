/**
 * Pure helpers for the customer-facing QR rewards flow.
 *
 * Everything here is presentation logic: sanitising the phone field, building
 * the quote/create request bodies, and describing the server's quote in plain
 * words. No money is calculated in this module and the phone is only ever put
 * in a JSON body, never in a URL, query string or log line.
 *
 * The contract is `docs/PRODUCT/API-CONTRACT.md` §18.20.5, §18.20.13 and
 * §18.20.15 E. `visitsRequired`, `rewardLabel`, `maxDiscount` and the server
 * `message` are always read from the server payload; no copy here hardcodes a
 * visit ordinal, reward value, cap or minimum-spend amount.
 */

import type { Cart } from '@/types/menu';
import type { OrderResponse } from '@/types/order';

/** The two QR checkout shapes. Flag-off keeps the pre-feature legacy path. */
export type QrCheckoutMode = 'legacy' | 'loyalty';

export type VisitState =
  | 'COUNTS'
  | 'ALREADY_COUNTED'
  | 'PROMOTION'
  | 'BELOW_MINIMUM'
  | 'GUEST';

export interface LoyaltyNotice {
  version: string;
  text: string;
  textHash: string;
  privacyUrl: string;
  termsText: string | null;
  visitsRequired: number;
  rewardLabel: string;
}

export interface LoyaltyQuote {
  success?: true;
  quoteId: string;
  quoteRevision: number;
  subtotal: string;
  promotionDiscountAmount: string;
  projectedRewardAmount: string;
  discountAmount: string;
  discountLines: { source: string; label: string; amount: string }[];
  discountedSubtotal: string;
  taxAmount: string;
  serviceCharge: string;
  totalAmount: string;
  projectedTotal: string;
  cashPayable: string;
  rewardLabel: string | null;
  rewardType: string;
  rewardValue: string;
  maxDiscount: string;
  promotionApplied: boolean;
  promotionScope: string | null;
  promotionLabel: string | null;
  promotionItems: { itemId: string; name: string }[];
  visitState: VisitState;
  visit: { completedVisits: number; visitsRequired: number };
  message: string;
}

export interface QuoteUnavailable {
  success: false;
  code: string;
  error?: string;
  retryAfterSeconds?: number;
}

export interface LoyaltyError {
  code: string;
  message: string;
}

/** The subset of the create response the QR confirmation renders. */
export interface LoyaltyOrderResult {
  success: true;
  order: OrderResponse;
  projectedTotal?: string;
  rewardLabel?: string | null;
  visitState?: VisitState;
  loyaltyError?: LoyaltyError | null;
  message?: string;
}

export interface LoyaltyDiscountLine {
  label: string;
  amount: string;
}

export interface LoyaltyConfirmation {
  subtotal: string;
  taxAmount: string;
  serviceCharge: string;
  discountLines: LoyaltyDiscountLine[];
  total: string;
  visitState: VisitState;
  visitProgress: string | null;
  rewardLabel: string | null;
  loyaltyError: LoyaltyError | null;
  message: string | null;
  noticeText: string | null;
}

export interface QrCreateRequest {
  tableId: string;
  sessionId?: string;
  quoteId?: string;
  expectedTotal?: string;
  customerInfo?: {
    phone?: string;
    consent?: boolean;
    consentVersion?: string;
    consentTextHash?: string;
  };
}

export interface QrQuoteRequest {
  tableId: string;
  sessionId?: string;
  phone?: string;
  consent?: boolean;
  consentVersion?: string;
  consentTextHash?: string;
}

/** Constant endpoints. They never contain a phone or any other customer value. */
export const QR_QUOTE_ENDPOINT = '/qr/orders/quote';
export const QR_CREATE_ENDPOINT = '/qr/orders/create';

export const TOTAL_UPDATED_MESSAGE =
  'Total updated. Review the new total before paying.';

const PHONE_EXAMPLE = '+60123456789';
const PHONE_INVALID_MESSAGE = `Enter a valid mobile number (e.g. ${PHONE_EXAMPLE}); the client normalises spaces/hyphens to E.164.`;
const CONSENT_REQUIRED_MESSAGE = 'Please agree to the rewards notice to join.';
const CONSENT_VERSION_REQUIRED_MESSAGE =
  'Review the rewards notice before joining.';
const CONSENT_STALE_MESSAGE =
  'The rewards notice changed. Review and agree again.';
const RATE_LIMITED_FALLBACK = 'Try again later.';
const LOYALTY_DISABLED_MESSAGE = 'Loyalty is off for this restaurant.';
const GENERIC_LOYALTY_ERROR_MESSAGE =
  'Could not add rewards. Staff can help at the counter.';
const ALREADY_COUNTED_MESSAGE = "Today's visit is already counted.";
const QR_BELOW_MINIMUM_MESSAGE =
  'This visit needs the minimum daily spend. Staff can help at the counter.';
const GUEST_MESSAGE =
  'Guest order - no visit tracked; staff can attach at the counter.';

/** The customer may type only `+` (first position) and digits, max 16 chars. */
export function sanitizePhoneInput(raw: string): string {
  if (!raw) return '';
  const allowed = raw.replace(/[^\d+]/g, '');
  const startsWithPlus = allowed.startsWith('+');
  const digits = allowed.replace(/\+/g, '');
  const normalised = startsWithPlus ? `+${digits}` : digits;
  return normalised.slice(0, 16);
}

/** Digits only, used for the legacy create body's pre-feature min length. */
export function phoneDigitCount(phone: string): number {
  return phone.replace(/\D/g, '').length;
}

/**
 * A field-level hint only. The server remains the authority; a number that
 * fails this check is still submitted so the order can fall back to a guest.
 */
export function phoneInputError(phone: string): string | null {
  const value = sanitizePhoneInput(phone);
  if (!value) return null;

  if (value.startsWith('+')) {
    const digits = value.slice(1);
    const ok =
      /^\d+$/.test(digits) && digits.length >= 8 && digits.length <= 15;
    return ok ? null : PHONE_INVALID_MESSAGE;
  }

  if (!/^\d+$/.test(value)) return PHONE_INVALID_MESSAGE;

  if (value.startsWith('0')) {
    const national = value.slice(1);
    return national.length >= 7 && national.length <= 10
      ? null
      : PHONE_INVALID_MESSAGE;
  }

  if (value.startsWith('60')) {
    return value.length >= 8 && value.length <= 15
      ? null
      : PHONE_INVALID_MESSAGE;
  }

  return PHONE_INVALID_MESSAGE;
}

export function isLoyaltyNotice(
  value: LoyaltyNotice | null | undefined
): value is LoyaltyNotice {
  return value !== null && value !== undefined;
}

export function checkoutMode(
  notice: LoyaltyNotice | null | undefined
): QrCheckoutMode {
  return isLoyaltyNotice(notice) ? 'loyalty' : 'legacy';
}

/**
 * The cart's cashback/voucher/login rows promise features that are not part of
 * the rewards flow. Keep them only in flag-off mode, where they are the
 * pre-feature behaviour.
 */
export function shouldShowLoginRows(
  notice: LoyaltyNotice | null | undefined
): boolean {
  return checkoutMode(notice) === 'legacy';
}

/**
 * When a notice refresh returns null, loyalty has been switched off while the
 * review is open. Leave the review and return to the cart if it still has
 * items, otherwise to the menu.
 */
export function viewAfterNoticeRefresh(
  notice: LoyaltyNotice | null,
  hasCartItems: boolean
): { showReview: boolean; showCart: boolean } {
  if (notice) return { showReview: true, showCart: false };
  return { showReview: false, showCart: hasCartItems };
}

/**
 * The quote route does not expose `guestReason`. With a phone and consent
 * supplied, a `GUEST` quote means the member could not be resolved (stale
 * consent, invalid number or a resolution failure) even when promotion copy
 * wins the message. Treat it as a consent refresh so the customer sees the
 * current notice and agrees again.
 */
export function guestQuoteNeedsConsentRefresh(
  phone: string,
  consent: boolean,
  quote: Pick<LoyaltyQuote, 'visitState'>
): boolean {
  return (
    sanitizePhoneInput(phone).length > 0 &&
    consent === true &&
    quote.visitState === 'GUEST'
  );
}

/**
 * The pre-feature QR create body, preserved byte-for-byte when a session and
 * phone are present. `sessionId` is omitted only when it is genuinely absent
 * (the old body sent `null`, which the legacy schema rejects).
 */
export function buildLegacyCreateRequest(
  tableId: string,
  sessionId: string | null | undefined,
  customerPhone?: string | null
): {
  tableId: string;
  sessionId?: string;
  customerInfo?: { phone: string };
} {
  const body: {
    tableId: string;
    sessionId?: string;
    customerInfo?: { phone: string };
  } = { tableId };
  if (sessionId) body.sessionId = sessionId;
  if (customerPhone) body.customerInfo = { phone: customerPhone };
  return body;
}

export function buildQuoteRequest(input: {
  tableId: string;
  sessionId?: string | null;
  phone?: string | null;
  consent?: boolean;
  notice?: LoyaltyNotice | null;
}): QrQuoteRequest {
  const body: QrQuoteRequest = { tableId: input.tableId };
  if (input.sessionId) body.sessionId = input.sessionId;

  const phone = sanitizePhoneInput(input.phone ?? '');
  if (!phone) return body;

  body.phone = phone;
  if (input.consent === true && input.notice) {
    body.consent = true;
    body.consentVersion = input.notice.version;
    body.consentTextHash = input.notice.textHash;
  }
  return body;
}

export function buildCreateRequest(input: {
  tableId: string;
  sessionId?: string | null;
  quote?: LoyaltyQuote | null;
  phone?: string | null;
  consent?: boolean;
  notice?: LoyaltyNotice | null;
}): QrCreateRequest {
  const body: QrCreateRequest = { tableId: input.tableId };
  if (input.sessionId) body.sessionId = input.sessionId;

  const phone = sanitizePhoneInput(input.phone ?? '');

  if (input.quote) {
    body.quoteId = input.quote.quoteId;
    body.expectedTotal = input.quote.projectedTotal;
  }

  // A loyalty quote accepts a malformed phone and falls back to a guest order.
  // The legacy create schema still requires the pre-feature minimum length, so
  // omit a too-short number rather than fail the order.
  const phoneAllowed = input.quote
    ? phone.length > 0
    : phoneDigitCount(phone) >= 8;
  if (!phoneAllowed) return body;

  body.customerInfo = { phone };
  if (input.consent === true && input.notice) {
    body.customerInfo.consent = true;
    body.customerInfo.consentVersion = input.notice.version;
    body.customerInfo.consentTextHash = input.notice.textHash;
  }
  return body;
}

export function quoteNeedsRefresh(
  quotedFor: { phone: string; consent: boolean } | null,
  phone: string,
  consent: boolean
): boolean {
  if (!quotedFor) return true;
  return quotedFor.phone !== phone || quotedFor.consent !== consent;
}

export function quoteUnavailableCode(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.success === false && typeof record.code === 'string') {
    return record.code;
  }
  return null;
}

export function retryAfterSeconds(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.retryAfterSeconds === 'number'
    ? record.retryAfterSeconds
    : null;
}

export interface ApiFailure {
  code?: string | null;
  retryAfterSeconds?: number | null;
}

export type CreateFailureAction =
  | { action: 'requote'; message: string }
  | { action: 'consent-stale'; message: string }
  | { action: 'consent-required'; message: string }
  | { action: 'phone-invalid'; message: string }
  | { action: 'rate-limited'; message: string }
  | { action: 'disabled'; message: string }
  | { action: 'staff-help'; message: string };

export function errorCopyFor(
  code: string | null | undefined,
  seconds?: number | null
): string {
  switch (code) {
    case 'PHONE_INVALID':
      return PHONE_INVALID_MESSAGE;
    case 'CONSENT_REQUIRED':
      return CONSENT_REQUIRED_MESSAGE;
    case 'CONSENT_VERSION_REQUIRED':
      return CONSENT_VERSION_REQUIRED_MESSAGE;
    case 'CONSENT_STALE':
      return CONSENT_STALE_MESSAGE;
    case 'RATE_LIMITED': {
      const retry = Math.ceil(seconds ?? 0);
      if (!Number.isFinite(retry) || retry <= 0) return RATE_LIMITED_FALLBACK;
      return `Try again in ${retry} ${retry === 1 ? 'second' : 'seconds'}.`;
    }
    case 'LOYALTY_DISABLED':
      return LOYALTY_DISABLED_MESSAGE;
    default:
      return GENERIC_LOYALTY_ERROR_MESSAGE;
  }
}

/**
 * Map a failed create to the next UI step. `QUOTE_CHANGED` re-quotes and asks
 * the customer to review the new total; recoverable field/consent errors stay
 * inline; everything else uses the staff-help copy.
 */
export function resolveCreateFailure(failure: ApiFailure): CreateFailureAction {
  switch (failure.code) {
    case 'QUOTE_CHANGED':
      return { action: 'requote', message: TOTAL_UPDATED_MESSAGE };
    case 'CONSENT_STALE':
      return {
        action: 'consent-stale',
        message: errorCopyFor('CONSENT_STALE'),
      };
    case 'CONSENT_REQUIRED':
      return {
        action: 'consent-required',
        message: errorCopyFor('CONSENT_REQUIRED'),
      };
    case 'CONSENT_VERSION_REQUIRED':
      return {
        action: 'consent-required',
        message: errorCopyFor('CONSENT_VERSION_REQUIRED'),
      };
    case 'PHONE_INVALID':
      return {
        action: 'phone-invalid',
        message: errorCopyFor('PHONE_INVALID'),
      };
    case 'RATE_LIMITED':
      return {
        action: 'rate-limited',
        message: errorCopyFor('RATE_LIMITED', failure.retryAfterSeconds),
      };
    case 'LOYALTY_DISABLED':
      return { action: 'disabled', message: errorCopyFor('LOYALTY_DISABLED') };
    default:
      return {
        action: 'staff-help',
        message: errorCopyFor(failure.code),
      };
  }
}

export interface RuleCopy {
  intro: string;
  visits: string;
  reward: string;
  capLabel: string;
  capAmount: string | null;
  minimum: string;
}

/**
 * Plain-words rule for the menu/cart and the review.
 *
 * Before a member is known the notice carries the restaurant's current rule.
 * Once a quote exists it is member-specific and carries the visit card's
 * snapshot (`visit.visitsRequired`, `rewardLabel`, `maxDiscount`), so the quote
 * wins where present. This keeps the review copy aligned with the card even
 * when the owner changed settings mid-cycle (V-01). The QR never shows a
 * minimum-spend amount (§18.20.15 B/E).
 */
export function buildRuleCopy(
  notice: LoyaltyNotice,
  quote?: LoyaltyQuote | null
): RuleCopy {
  const visits = quote?.visit?.visitsRequired ?? notice.visitsRequired;
  const rewardLabel = quote?.rewardLabel?.trim() || notice.rewardLabel;
  return {
    intro: 'Earn a visit when you order.',
    visits: `Collect ${visits} ${visits === 1 ? 'visit' : 'visits'} to earn a reward.`,
    reward: `Reward: ${rewardLabel}.`,
    capLabel: 'Reward cap:',
    capAmount:
      quote?.maxDiscount && quote.maxDiscount !== '0.00'
        ? quote.maxDiscount
        : null,
    minimum: 'A minimum daily spend applies before a visit counts.',
  };
}

export function visitStateBadge(state: VisitState): string {
  switch (state) {
    case 'COUNTS':
      return 'Visit counts';
    case 'PROMOTION':
      return 'Promotion applied';
    case 'ALREADY_COUNTED':
      return 'Already counted';
    case 'BELOW_MINIMUM':
      return 'Below minimum';
    case 'GUEST':
      return 'Guest order';
  }
}

export function visitStateCopy(state: VisitState): string {
  switch (state) {
    case 'COUNTS':
      return 'This visit counts.';
    case 'PROMOTION':
      return 'Promotion applied; this visit does not count.';
    case 'ALREADY_COUNTED':
      return ALREADY_COUNTED_MESSAGE;
    case 'BELOW_MINIMUM':
      return QR_BELOW_MINIMUM_MESSAGE;
    case 'GUEST':
      return GUEST_MESSAGE;
  }
}

export interface QuoteView {
  quoteId: string;
  total: string;
  cashPayable: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  serviceCharge: string;
  discountLines: { label: string; amount: string }[];
  promotionApplied: boolean;
  promotionLabel: string | null;
  promotionItems: string[];
  visitState: VisitState;
  visitCounts: boolean;
  visitProgress: string | null;
  completedVisits: number;
  visitsRequired: number;
  rewardLabel: string | null;
  maxDiscount: string;
  message: string;
}

/**
 * Describe a server quote for rendering. Every amount is passed through as the
 * server string; nothing is summed, discounted or rounded here.
 */
export function describeQuote(quote: LoyaltyQuote): QuoteView {
  return {
    quoteId: quote.quoteId,
    total: quote.projectedTotal,
    cashPayable: quote.cashPayable,
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    taxAmount: quote.taxAmount,
    serviceCharge: quote.serviceCharge,
    discountLines: quote.discountLines.map((line) => ({
      label: line.label,
      amount: line.amount,
    })),
    promotionApplied: quote.promotionApplied,
    promotionLabel: quote.promotionLabel,
    promotionItems: quote.promotionItems.map((item) => item.name),
    visitState: quote.visitState,
    visitCounts: quote.visitState === 'COUNTS',
    visitProgress:
      quote.visitState === 'GUEST'
        ? null
        : `${quote.visit.completedVisits} of ${quote.visit.visitsRequired}`,
    completedVisits: quote.visit.completedVisits,
    visitsRequired: quote.visit.visitsRequired,
    rewardLabel: quote.rewardLabel,
    maxDiscount: quote.maxDiscount,
    message: quote.message,
  };
}

/**
 * A create response carries loyalty fields only when the loyalty path actually
 * confirmed the order. A legacy response (loyalty switched off between quote
 * and create) has neither field and must not inherit the stale quote.
 */
export function hasLoyaltyCreateFields(result: LoyaltyOrderResult): boolean {
  return result.projectedTotal !== undefined || result.visitState !== undefined;
}

/**
 * Build the confirmation model. A create that fell back to a guest still
 * succeeds; `loyaltyError` is shown as copy, never as a failed order. Returns
 * null when the create response has no loyalty fields, so the caller renders
 * the plain pre-feature confirmation.
 */
export function confirmationFromCreate(
  result: LoyaltyOrderResult,
  quote: LoyaltyQuote | null,
  noticeText?: string | null
): LoyaltyConfirmation | null {
  if (!hasLoyaltyCreateFields(result)) return null;

  const visitState = result.visitState ?? quote?.visitState ?? 'GUEST';
  const visit = quote?.visit ?? null;
  // A guest order has no member card, so it must never show member progress.
  const visitProgress =
    visitState !== 'GUEST' && visit
      ? `${visit.completedVisits} of ${visit.visitsRequired}`
      : null;
  return {
    subtotal: quote?.subtotal ?? String(result.order.subtotalAmount),
    taxAmount: quote?.taxAmount ?? String(result.order.taxAmount),
    serviceCharge: quote?.serviceCharge ?? String(result.order.serviceCharge),
    discountLines:
      quote?.discountLines.map((line) => ({
        label: line.label,
        amount: line.amount,
      })) ?? [],
    total:
      result.projectedTotal ??
      quote?.projectedTotal ??
      String(result.order.totalAmount),
    visitState,
    visitProgress,
    // `result.rewardLabel` is the create response's "a reward is projected"
    // signal. The quote's `rewardLabel` is the rule label and is present even
    // when no reward applies, so it must never be used here (§18.20.15 C/E).
    rewardLabel: result.rewardLabel ?? null,
    loyaltyError: result.loyaltyError ?? null,
    message: result.message ?? null,
    // A stale-consent guest order re-shows the current server notice.
    noticeText:
      result.loyaltyError?.code === 'CONSENT_STALE'
        ? (noticeText ?? null)
        : null,
  };
}

/** Cart items shown on the review screen. Prices stay in the server total. */
export function cartItemSummary(
  cart: Cart
): { name: string; quantity: number }[] {
  return cart.items.map((item) => ({
    name: item.menuItem.name,
    quantity: item.quantity,
  }));
}
