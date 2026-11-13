/**
 * Loyalty notice and consent validation.
 *
 * The notice version, text and hash are always derived on the server from
 * `LoyaltySettings`; the client only sends its version and hash so the server
 * can prove it is consenting to the current notice (§18.20.14 B, §18.20.15 B).
 *
 * This module is pure: it performs no I/O and never reads the database.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** The subset of `LoyaltySettings` needed to resolve a notice. */
export interface LoyaltyNoticeSettings {
  noticeVersion?: string | null;
  noticeText?: string | null;
  noticeTextHash?: string | null;
  privacyUrl?: string | null;
  termsText?: string | null;
}

/** The server-derived notice a customer is consenting to. */
export interface LoyaltyNotice {
  version: string;
  text: string;
  textHash: string;
  privacyUrl: string;
  termsText: string | null;
}

/** The client-supplied consent proof. */
export interface ConsentInput {
  clientVersion?: string | null;
  clientTextHash?: string | null;
}

export type ConsentErrorCode =
  | 'CONSENT_REQUIRED'
  | 'CONSENT_VERSION_REQUIRED'
  | 'CONSENT_STALE';

/** The values to persist after successful validation. Never client strings. */
export interface VerifiedConsent {
  version: string;
  textHash: string;
  text: string;
  privacyUrl: string;
  termsText: string | null;
}

export type ConsentVerification =
  | { ok: true; consent: VerifiedConsent }
  | { ok: false; code: ConsentErrorCode; message: string };

const CONSENT_REQUIRED_MESSAGE = 'Please agree to the rewards notice to join.';
const CONSENT_VERSION_REQUIRED_MESSAGE =
  'Review the rewards notice before joining.';
const CONSENT_STALE_MESSAGE =
  'The rewards notice changed. Review and agree again.';

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Canonical hash of the notice text: SHA-256 of the exact UTF-8 string, hex
 * encoded. The settings writer (P6) must use this helper so the stored
 * `noticeTextHash` stays consistent with the text.
 */
export function hashNoticeText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Compare two strings without leaking their contents through timing.
 *
 * `crypto.timingSafeEqual` requires equal-length buffers, so a length mismatch
 * is rejected first. The values compared here are hashes, not secrets, but the
 * contract requires constant-time comparison.
 */
function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Resolve the server notice from `LoyaltySettings`.
 *
 * Returns `null` when any required field is missing or when the stored
 * `noticeTextHash` does not match the stored text. Callers must treat `null` as
 * `LOYALTY_DISABLED` and record no consent (§18.20.15 B).
 */
export function resolveNotice(
  settings: LoyaltyNoticeSettings | null | undefined
): LoyaltyNotice | null {
  if (!settings) return null;

  const version = nonEmpty(settings.noticeVersion);
  // Keep the notice text exactly as stored so the hash and the displayed text
  // cannot drift; only use trimming to decide whether it is present.
  const text =
    typeof settings.noticeText === 'string' &&
    settings.noticeText.trim().length > 0
      ? settings.noticeText
      : null;
  const storedHash = nonEmpty(settings.noticeTextHash);
  const privacyUrl = nonEmpty(settings.privacyUrl);

  if (!version || !text || !storedHash || !privacyUrl) return null;

  const expectedHash = hashNoticeText(text);
  if (!constantTimeEqual(storedHash.toLowerCase(), expectedHash)) return null;

  return {
    version,
    text,
    textHash: expectedHash,
    privacyUrl,
    termsText: nonEmpty(settings.termsText),
  };
}

function consentFailure(
  code: ConsentErrorCode,
  message: string
): ConsentVerification {
  return { ok: false, code, message };
}

/**
 * Validate the client's consent proof against the server notice.
 *
 * - no proof at all → `CONSENT_REQUIRED`
 * - hash but no version → `CONSENT_VERSION_REQUIRED`
 * - version but no hash → `CONSENT_REQUIRED`
 * - version or hash mismatch → `CONSENT_STALE`
 *
 * On success the returned consent contains the server-derived version and hash,
 * never the client's strings.
 */
export function verifyConsent(
  input: ConsentInput | null | undefined,
  notice: LoyaltyNotice
): ConsentVerification {
  const clientVersion = nonEmpty(input?.clientVersion);
  const clientTextHash = nonEmpty(input?.clientTextHash);

  if (!clientVersion && !clientTextHash) {
    return consentFailure('CONSENT_REQUIRED', CONSENT_REQUIRED_MESSAGE);
  }

  if (!clientVersion) {
    return consentFailure(
      'CONSENT_VERSION_REQUIRED',
      CONSENT_VERSION_REQUIRED_MESSAGE
    );
  }

  if (!clientTextHash) {
    return consentFailure('CONSENT_REQUIRED', CONSENT_REQUIRED_MESSAGE);
  }

  if (clientVersion !== notice.version) {
    return consentFailure('CONSENT_STALE', CONSENT_STALE_MESSAGE);
  }

  if (!constantTimeEqual(clientTextHash.toLowerCase(), notice.textHash)) {
    return consentFailure('CONSENT_STALE', CONSENT_STALE_MESSAGE);
  }

  return {
    ok: true,
    consent: {
      version: notice.version,
      textHash: notice.textHash,
      text: notice.text,
      privacyUrl: notice.privacyUrl,
      termsText: notice.termsText,
    },
  };
}
