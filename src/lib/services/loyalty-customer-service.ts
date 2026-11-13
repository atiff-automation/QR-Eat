/**
 * Loyalty customer resolution and anonymisation.
 *
 * The phone number is the member id. A customer is resolved or created only
 * when the phone is valid and the consent proof matches the server notice
 * (§18.20.4 step 1, §18.20.15 B). A missing or invalid phone never throws: the
 * caller receives a typed `loyaltyError` and falls back to a guest order.
 *
 * Every query is tenant-scoped by `restaurantId`. This service never writes
 * `LoyaltyVisit` or `LoyaltyCard`.
 */

import { prisma } from '@/lib/database';
import {
  LoyaltyConfigurationError,
  hashPhone,
  normalisePhone,
  type PhoneErrorCode,
} from '@/lib/loyalty/phone';
import {
  verifyConsent,
  type ConsentErrorCode,
  type ConsentInput,
  type LoyaltyNotice,
} from '@/lib/loyalty/consent';

export type LoyaltyCustomerErrorCode =
  | 'LOYALTY_DISABLED'
  | PhoneErrorCode
  | ConsentErrorCode;

export interface LoyaltyCustomerError {
  code: LoyaltyCustomerErrorCode;
  message: string;
}

export interface ResolveOrCreateCustomerInput {
  restaurantId: string;
  phone: string | null | undefined;
  consent?: ConsentInput | null;
  notice: LoyaltyNotice | null;
  name?: string | null;
  /** Where the consent was captured, for example `QR` or `COUNTER`. */
  source: string;
}

export interface ResolveOrCreateCustomerResult {
  customerId: string | null;
  isNew: boolean;
  consentOk: boolean;
  loyaltyError: LoyaltyCustomerError | null;
}

export interface AnonymiseCustomerInput {
  restaurantId: string;
  customerId: string;
}

export interface AnonymiseCustomerResult {
  anonymised: boolean;
}

const ERROR_MESSAGES: Record<LoyaltyCustomerErrorCode, string> = {
  LOYALTY_DISABLED: 'Loyalty is not available.',
  PHONE_INVALID: 'Enter a valid mobile number.',
  CONSENT_REQUIRED: 'Please agree to the rewards notice to join.',
  CONSENT_VERSION_REQUIRED: 'Review the rewards notice before joining.',
  CONSENT_STALE: 'The rewards notice changed. Review and agree again.',
};

function failure(
  code: LoyaltyCustomerErrorCode
): ResolveOrCreateCustomerResult {
  return {
    customerId: null,
    isNew: false,
    consentOk: false,
    loyaltyError: { code, message: ERROR_MESSAGES[code] },
  };
}

function success(
  customerId: string,
  isNew: boolean
): ResolveOrCreateCustomerResult {
  return {
    customerId,
    isNew,
    consentOk: true,
    loyaltyError: null,
  };
}

function cleanName(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Resolve the ACTIVE customer for `(restaurantId, phoneHash)`, or create one on
 * first confirmed member.
 *
 * An existing row records a fresh consent only when the consent proof is valid.
 * An `ANONYMIZED` row is not returned by the ACTIVE lookup, so re-enrolment
 * creates a new ACTIVE row while the anonymised financial history remains.
 */
export async function resolveOrCreateCustomer(
  input: ResolveOrCreateCustomerInput
): Promise<ResolveOrCreateCustomerResult> {
  const phoneResult = normalisePhone(input.phone);
  if (!phoneResult.ok) return failure('PHONE_INVALID');

  if (!input.notice) return failure('LOYALTY_DISABLED');

  const consentResult = verifyConsent(input.consent, input.notice);
  if (!consentResult.ok) return failure(consentResult.code);

  let phoneHash: string;
  try {
    phoneHash = hashPhone(phoneResult.phone);
  } catch (error) {
    if (error instanceof LoyaltyConfigurationError) {
      return failure('LOYALTY_DISABLED');
    }
    throw error;
  }

  const restaurantId = input.restaurantId;
  const name = cleanName(input.name);
  const now = new Date();

  const existing = await prisma.customer.findFirst({
    where: { restaurantId, phoneHash, status: 'ACTIVE' },
  });

  if (existing) {
    const updated = await prisma.customer.updateMany({
      where: { id: existing.id, restaurantId, status: 'ACTIVE' },
      data: {
        consentAt: now,
        consentVersion: consentResult.consent.version,
        consentTextHash: consentResult.consent.textHash,
        consentSource: input.source,
        consentWithdrawnAt: null,
        ...(name ? { name } : {}),
      },
    });

    if (updated.count !== 1) {
      // A concurrent anonymise may have moved the row out of ACTIVE between
      // the read and the update. Re-read once and fall back to guest rather
      // than attaching an anonymised customer.
      const current = await prisma.customer.findFirst({
        where: { id: existing.id, restaurantId },
      });
      if (!current || current.status !== 'ACTIVE') {
        return failure('LOYALTY_DISABLED');
      }
    }

    return success(existing.id, false);
  }

  try {
    const created = await prisma.customer.create({
      data: {
        restaurantId,
        phone: phoneResult.phone,
        phoneHash,
        name,
        consentAt: now,
        consentVersion: consentResult.consent.version,
        consentTextHash: consentResult.consent.textHash,
        consentSource: input.source,
        consentWithdrawnAt: null,
        status: 'ACTIVE',
      },
    });

    return success(created.id, true);
  } catch (error) {
    // Two first orders can race on the same phone. The partial unique index
    // keeps one ACTIVE row; the loser re-reads it instead of failing the order.
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.customer.findFirst({
        where: { restaurantId, phoneHash, status: 'ACTIVE' },
      });
      if (raced) return success(raced.id, false);
    }
    throw error;
  }
}

/**
 * Anonymise a customer in place.
 *
 * Keeps `phoneHash` (needed for same-day visit dedupe and reporting) and every
 * financial row. Nulls the phone and name, sets `status='ANONYMIZED'` and
 * stamps `anonymizedAt`. There is no hard delete (§18.20.9).
 */
export async function anonymiseCustomer(
  input: AnonymiseCustomerInput
): Promise<AnonymiseCustomerResult> {
  const result = await prisma.customer.updateMany({
    where: { id: input.customerId, restaurantId: input.restaurantId },
    data: {
      status: 'ANONYMIZED',
      anonymizedAt: new Date(),
      phone: null,
      name: null,
    },
  });

  return { anonymised: result.count > 0 };
}
