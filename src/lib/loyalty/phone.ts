/**
 * Phone normalisation, hashing and masking for loyalty members.
 *
 * Phone numbers are PII. The full number must never be logged, placed in a
 * thrown message, or returned in an error object. Callers store only the E.164
 * value (nullable after anonymisation), the HMAC `phoneHash` and a masked
 * display value.
 */

import { createHmac } from 'node:crypto';

/** The only phone failure code in the contract (§18.20.12). */
export type PhoneErrorCode = 'PHONE_INVALID';

export type PhoneNormalisationResult =
  | { ok: true; phone: string }
  | { ok: false; code: PhoneErrorCode };

/** Reason the loyalty phone key is unusable. */
export type LoyaltyConfigurationErrorReason = 'PHONE_HMAC_KEY_MISSING';

/**
 * A typed configuration failure. The message is deliberately generic and never
 * contains a phone number or a key.
 */
export class LoyaltyConfigurationError extends Error {
  readonly code = 'LOYALTY_CONFIGURATION_ERROR';
  readonly reason: LoyaltyConfigurationErrorReason;

  constructor(reason: LoyaltyConfigurationErrorReason) {
    super('Loyalty phone hashing is not configured.');
    this.name = 'LoyaltyConfigurationError';
    this.reason = reason;
  }
}

/** Separators customers commonly type in a phone number. */
const SEPARATORS = /[\s\-().]/g;

/** E.164 allows at most 15 digits including the country code. */
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/** Malaysian national numbers (after the leading local `0`) are 7–10 digits. */
const MY_NATIONAL_MIN_DIGITS = 7;
const MY_NATIONAL_MAX_DIGITS = 10;

function invalid(): PhoneNormalisationResult {
  return { ok: false, code: 'PHONE_INVALID' };
}

/**
 * Normalise a phone number to E.164.
 *
 * Accepted forms:
 * - Malaysian local: `0123456789` → `+60123456789`
 * - Malaysian international without `+`: `60123456789` → `+60123456789`
 * - Any `+`-prefixed E.164 number: `+6591234567` is kept as-is
 *
 * Spaces, hyphens, parentheses and dots are ignored. Anything else that is not
 * a digit (or a single leading `+`) is rejected. The function is deterministic
 * and idempotent.
 */
export function normalisePhone(
  input: string | null | undefined
): PhoneNormalisationResult {
  if (typeof input !== 'string') return invalid();

  const compact = input.replace(SEPARATORS, '');
  if (compact.length === 0) return invalid();

  if (compact.startsWith('+')) {
    const digits = compact.slice(1);
    if (!/^\d+$/.test(digits)) return invalid();
    if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) {
      return invalid();
    }
    return { ok: true, phone: `+${digits}` };
  }

  if (!/^\d+$/.test(compact)) return invalid();

  if (compact.startsWith('0')) {
    const national = compact.slice(1);
    if (
      national.length < MY_NATIONAL_MIN_DIGITS ||
      national.length > MY_NATIONAL_MAX_DIGITS
    ) {
      return invalid();
    }
    return { ok: true, phone: `+60${national}` };
  }

  if (compact.startsWith('60')) {
    if (compact.length < E164_MIN_DIGITS || compact.length > E164_MAX_DIGITS) {
      return invalid();
    }
    return { ok: true, phone: `+${compact}` };
  }

  // A bare national number without a country code is ambiguous.
  return invalid();
}

/**
 * HMAC-SHA-256 of the E.164 number, hex encoded.
 *
 * The key comes from `LOYALTY_PHONE_HMAC_KEY`. A missing or empty key throws a
 * typed configuration error: hashing with a default or empty key would make
 * every deployment's hashes interchangeable, so this fails closed.
 */
export function hashPhone(
  e164: string,
  key: string | undefined = process.env.LOYALTY_PHONE_HMAC_KEY
): string {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new LoyaltyConfigurationError('PHONE_HMAC_KEY_MISSING');
  }

  return createHmac('sha256', key).update(e164, 'utf8').digest('hex');
}

/**
 * Country codes that are three digits. Everything else is treated as a
 * two-digit code, except the single-digit `+1` and `+7` plans. This is only
 * used to decide how much of a masked number is safe to show; it is not a
 * routing table.
 */
const THREE_DIGIT_CALLING_CODES = new Set([
  '800',
  '808',
  '850',
  '852',
  '853',
  '855',
  '856',
  '870',
  '878',
  '880',
  '881',
  '882',
  '883',
  '886',
  '888',
  '960',
  '961',
  '962',
  '963',
  '964',
  '965',
  '966',
  '967',
  '968',
  '970',
  '971',
  '972',
  '973',
  '974',
  '975',
  '976',
  '977',
  '979',
  '992',
  '993',
  '994',
  '995',
  '996',
  '998',
]);

function callingCodeLength(digits: string): number {
  if (digits.startsWith('1') || digits.startsWith('7')) return 1;
  if (THREE_DIGIT_CALLING_CODES.has(digits.slice(0, 3))) return 3;
  return 2;
}

/**
 * Mask a phone number for display, keeping the country code and the last two
 * digits: `+6012345678` → `+60••••••78`.
 *
 * The result always contains at least one mask character, so it can never
 * equal the full number. Invalid input is masked defensively rather than
 * echoed.
 */
export function maskPhone(e164: string): string {
  const digits = e164.startsWith('+') ? e164.slice(1) : e164;

  if (!/^\d+$/.test(digits) || digits.length < 3) {
    return '+••••';
  }

  const codeLength = Math.min(
    callingCodeLength(digits),
    Math.max(1, digits.length - 1)
  );
  const countryCode = digits.slice(0, codeLength);
  const national = digits.slice(codeLength);

  // With two or fewer national digits, keeping the last two would reveal the
  // whole national number. Fall back to a generic mask so no digit is
  // recoverable.
  if (national.length <= 2) return '+••••';

  const visible = national.slice(-2);
  const hiddenCount = national.length - 2;

  return `+${countryCode}${'•'.repeat(hiddenCount)}${visible}`;
}
