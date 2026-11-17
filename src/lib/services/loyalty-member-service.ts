/**
 * Owner member management for the loyalty surface (§18.20.7, §18.20.9,
 * §18.20.14 A/B).
 *
 * The phone number is the member id. Search is an **exact** E.164 lookup by
 * `phoneHash`: never a prefix, partial or fuzzy match. A caller without
 * `members:pii` only ever receives a masked number. Every search, full-phone
 * read and export writes an audit row with actor, target, purpose and
 * timestamp; audit metadata never contains a phone number or name. The search
 * audit deliberately records the keyed `phoneHash` as its target so abuse
 * review can identify the number looked up without storing the phone itself.
 *
 * Consent withdrawal and anonymisation are state transitions, not deletes.
 * Financial rows (`Order`, `Payment`, `LoyaltyVisit`, `OrderDiscount`) and
 * `phoneHash` are retained so reporting and same-day visit dedupe keep working.
 */

import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, type TransactionClient } from '@/lib/database';
import { resolveNotice } from '@/lib/loyalty/consent';
import {
  LoyaltyConfigurationError,
  hashPhone,
  maskPhone,
  normalisePhone,
} from '@/lib/loyalty/phone';
import {
  runIdempotentOwnerMutation,
  stableRequestHash,
} from '@/lib/services/loyalty-owner-idempotency';

/** Maximum rows a search may return (§18.20.7). */
export const MEMBER_SEARCH_LIMIT = 50;

/** Maximum length of an owner-entered member name (P7d). */
export const MEMBER_NAME_MAX_LENGTH = 80;

export class MemberValidationError extends Error {
  readonly code: string;
  readonly statusCode = 400;

  constructor(message: string, code = 'INVALID_REQUEST') {
    super(message);
    this.name = 'MemberValidationError';
    this.code = code;
  }
}

export class MemberNotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('Member not found');
    this.name = 'MemberNotFoundError';
  }
}

export class MemberStateError extends Error {
  readonly code: string;
  readonly statusCode = 409;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MemberStateError';
    this.code = code;
  }
}

export class MemberConfigurationError extends Error {
  readonly code = 'LOYALTY_CONFIGURATION_ERROR';
  readonly statusCode = 500;

  constructor() {
    super('Loyalty member data is not configured.');
    this.name = 'MemberConfigurationError';
  }
}

export interface MemberCardView {
  visitsInCycle: number;
  visitsRequired: number;
  cycleNumber: number;
}

export interface MemberView {
  id: string;
  name: string | null;
  /** Full E.164 phone only when the caller has `members:pii`; otherwise null. */
  phone: string | null;
  maskedPhone: string | null;
  status: 'ACTIVE' | 'ANONYMIZED';
  consentAt: string | null;
  consentVersion: string | null;
  consentSource: string | null;
  consentWithdrawnAt: string | null;
  marketingOptIn: boolean;
  marketingConsentAt: string | null;
  marketingConsentVersion: string | null;
  marketingConsentSource: string | null;
  marketingWithdrawnAt: string | null;
  anonymizedAt: string | null;
  lastVisitAt: string | null;
  createdAt: string;
  updatedAt: string;
  card: MemberCardView | null;
}

interface MemberCardRow {
  visitsInCycle: number;
  visitsRequired: number;
  cycleNumber: number;
}

interface MemberRow {
  id: string;
  name: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'ANONYMIZED';
  consentAt: Date | string | null;
  consentVersion: string | null;
  consentSource: string | null;
  consentWithdrawnAt: Date | string | null;
  marketingOptIn: boolean;
  marketingConsentAt: Date | string | null;
  marketingConsentVersion: string | null;
  marketingConsentSource: string | null;
  marketingWithdrawnAt: Date | string | null;
  anonymizedAt: Date | string | null;
  lastVisitAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  loyaltyCard?: MemberCardRow | null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toMemberView(row: MemberRow, revealPhone: boolean): MemberView {
  const phone = row.phone ?? null;
  return {
    id: row.id,
    name: row.name,
    phone: revealPhone ? phone : null,
    maskedPhone: phone ? maskPhone(phone) : null,
    status: row.status,
    consentAt: iso(row.consentAt),
    consentVersion: row.consentVersion,
    consentSource: row.consentSource,
    consentWithdrawnAt: iso(row.consentWithdrawnAt),
    marketingOptIn: row.marketingOptIn,
    marketingConsentAt: iso(row.marketingConsentAt),
    marketingConsentVersion: row.marketingConsentVersion,
    marketingConsentSource: row.marketingConsentSource,
    marketingWithdrawnAt: iso(row.marketingWithdrawnAt),
    anonymizedAt: iso(row.anonymizedAt),
    lastVisitAt: iso(row.lastVisitAt),
    createdAt: iso(row.createdAt) as string,
    updatedAt: iso(row.updatedAt) as string,
    card: row.loyaltyCard
      ? {
          visitsInCycle: row.loyaltyCard.visitsInCycle,
          visitsRequired: row.loyaltyCard.visitsRequired,
          cycleNumber: row.loyaltyCard.cycleNumber,
        }
      : null,
  };
}

/**
 * Receipt-safe member view. The 24h idempotency receipt must not retain PII,
 * so the name and every phone representation are removed. The live response
 * may still use `toMemberView` with the caller's `members:pii` entitlement.
 */
function toReceiptMemberView(row: MemberRow): MemberView {
  return {
    ...toMemberView(row, false),
    name: null,
    maskedPhone: null,
  };
}

function cleanPurpose(purpose: string | null | undefined, fallback: string) {
  const trimmed = typeof purpose === 'string' ? purpose.trim() : '';
  return trimmed.length > 0 ? trimmed.slice(0, 200) : fallback;
}

function requirePurpose(purpose: string | null | undefined): string {
  const trimmed = typeof purpose === 'string' ? purpose.trim() : '';
  if (trimmed.length === 0) {
    throw new MemberValidationError(
      'A purpose is required for member search',
      'INVALID_REQUEST'
    );
  }
  return trimmed.slice(0, 200);
}

interface AuditActor {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
}

function auditData(input: {
  tableName: string;
  recordId: string;
  operation: string;
  description: string;
  actor: AuditActor;
  metadata: Prisma.InputJsonValue;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
}) {
  return {
    tableName: input.tableName,
    recordId: input.recordId,
    operation: input.operation,
    oldValues: input.oldValues,
    newValues: input.newValues,
    changedBy: input.actor.actorId,
    changedByType: input.actor.actorType ?? null,
    restaurantId: input.actor.restaurantId,
    category: 'members',
    description: input.description,
    metadata: input.metadata,
  };
}

export interface SearchMembersInput {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
  phone: string;
  purpose: string;
  revealPhone: boolean;
}

export interface SearchMembersResult {
  members: MemberView[];
}

/**
 * Exact member search by phone. The phone must normalise to E.164 and only an
 * ACTIVE member for the current restaurant is returned. The result is capped at
 * 50 even though the partial unique index allows at most one ACTIVE row.
 */
export async function searchMembers(
  input: SearchMembersInput
): Promise<SearchMembersResult> {
  const purpose = requirePurpose(input.purpose);
  const normalised = normalisePhone(input.phone);

  if (!normalised.ok) {
    await prisma.auditLog.create({
      data: auditData({
        tableName: 'customers',
        recordId: input.restaurantId,
        operation: 'READ',
        description: 'Member search rejected',
        actor: input,
        metadata: {
          purpose,
          resultCount: 0,
          pii: false,
          outcome: 'PHONE_INVALID',
        },
      }),
    });
    throw new MemberValidationError(
      'Enter a valid mobile number.',
      'PHONE_INVALID'
    );
  }

  let phoneHash: string;
  try {
    phoneHash = hashPhone(normalised.phone);
  } catch (error) {
    if (error instanceof LoyaltyConfigurationError) {
      throw new MemberConfigurationError();
    }
    throw error;
  }

  const rows = await prisma.customer.findMany({
    where: {
      restaurantId: input.restaurantId,
      phoneHash,
      status: 'ACTIVE',
    },
    take: MEMBER_SEARCH_LIMIT,
    orderBy: { createdAt: 'desc' },
    include: { loyaltyCard: true },
  });

  await prisma.auditLog.create({
    data: auditData({
      tableName: 'customers',
      recordId: phoneHash,
      operation: 'READ',
      description: 'Member search',
      actor: input,
      metadata: {
        purpose,
        phoneHash,
        resultCount: rows.length,
        pii: input.revealPhone,
        exactMatch: true,
      },
    }),
  });

  return {
    members: rows.map((row) =>
      toMemberView(row as unknown as MemberRow, input.revealPhone)
    ),
  };
}

export interface GetMemberInput {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
  memberId: string;
  purpose?: string | null;
  revealPhone: boolean;
}

export interface GetMemberResult {
  member: MemberView;
}

/**
 * Read one member. The lookup is tenant-scoped, so a member belonging to
 * another restaurant is indistinguishable from a missing member (404). A full
 * phone is only returned when `revealPhone` is true and that read is audited.
 */
export async function getMember(
  input: GetMemberInput
): Promise<GetMemberResult> {
  const row = await prisma.customer.findFirst({
    where: { id: input.memberId, restaurantId: input.restaurantId },
    include: { loyaltyCard: true },
  });

  if (!row) throw new MemberNotFoundError();

  if (input.revealPhone) {
    await prisma.auditLog.create({
      data: auditData({
        tableName: 'customers',
        recordId: input.memberId,
        operation: 'READ',
        description: 'Member full phone viewed',
        actor: input,
        metadata: {
          purpose: cleanPurpose(input.purpose, 'Member profile view'),
          pii: true,
          fields: ['phone'],
        },
      }),
    });
  }

  return {
    member: toMemberView(row as unknown as MemberRow, input.revealPhone),
  };
}

/**
 * Normalise an owner-entered name: trim, treat empty as "clear", and reject
 * anything longer than `MEMBER_NAME_MAX_LENGTH` after trimming. The route
 * applies the same bound; this guard covers direct service callers too.
 */
function normaliseMemberName(name: string | null): string | null {
  if (name === null) return null;
  if (typeof name !== 'string') {
    throw new MemberValidationError(
      'A member name must be text or null',
      'INVALID_REQUEST'
    );
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MEMBER_NAME_MAX_LENGTH) {
    throw new MemberValidationError(
      `A member name can be at most ${MEMBER_NAME_MAX_LENGTH} characters`,
      'INVALID_REQUEST'
    );
  }
  return trimmed;
}

export interface RenameMemberInput {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
  memberId: string;
  name: string | null;
  revealPhone: boolean;
  idempotencyKey: string;
}

export interface RenameMemberResult {
  member: MemberView;
  replayed: boolean;
  statusCode: number;
}

/**
 * Owner rename behind `members:pii` (P7d, closes P7c-10).
 *
 * The QR and Counter attach paths stay write-once (`resolveOrCreateCustomer`);
 * this is the only corrective path. The lookup is tenant-scoped, so a member
 * from another restaurant is a 404. An anonymised member has nothing to rename
 * and is rejected with `MEMBER_ANONYMIZED`.
 *
 * The audit row is written in the same transaction as the update and records
 * only *that* the name changed: the old and new values are never stored in
 * `oldValues`, `newValues` or `metadata`. It carries a purpose because the
 * response can return the full phone to a `members:pii` caller (§18.20.14 A).
 * The 24h idempotency receipt is also PII-free (the name and every phone
 * representation are stripped), so a replay re-reads the live member to return
 * the same view the first call returned. The request hash is keyed with
 * `hashPhone`, so the persisted digest of the low-entropy name is not
 * brute-forceable (same reasoning as F-08).
 *
 * The write is conditional on `status='ACTIVE'` and the tenant, so a concurrent
 * `deleteMember` cannot leave a name on an `ANONYMIZED` row. This is the same
 * race guard `resolveOrCreateCustomer` uses: `updateMany` + `count !== 1` +
 * one re-read.
 */
export async function renameMember(
  input: RenameMemberInput
): Promise<RenameMemberResult> {
  const name = normaliseMemberName(input.name);

  let requestHash: string;
  try {
    requestHash = hashPhone(
      JSON.stringify({
        restaurantId: input.restaurantId,
        memberId: input.memberId,
        name,
        actorId: input.actorId,
        revealPhone: input.revealPhone,
      })
    );
  } catch (error) {
    if (error instanceof LoyaltyConfigurationError) {
      throw new MemberConfigurationError();
    }
    throw error;
  }

  const result = await runIdempotentOwnerMutation<{ member: MemberView }>({
    restaurantId: input.restaurantId,
    action: 'members.rename',
    key: input.idempotencyKey,
    requestHash,
    execute: async (tx: TransactionClient) => {
      const existing = await tx.customer.findFirst({
        where: { id: input.memberId, restaurantId: input.restaurantId },
        include: { loyaltyCard: true },
      });
      if (!existing) throw new MemberNotFoundError();

      if (existing.status === 'ANONYMIZED') {
        throw new MemberStateError(
          'An anonymised member cannot be renamed',
          'MEMBER_ANONYMIZED'
        );
      }

      // Conditional write: a concurrent anonymise moves the row out of
      // ACTIVE, so this statement must not match it. Without the status and
      // tenant predicates a rename could land a name on an ANONYMIZED row
      // (PII retention violation).
      const write = await tx.customer.updateMany({
        where: {
          id: existing.id,
          restaurantId: input.restaurantId,
          status: 'ACTIVE',
        },
        data: { name },
      });

      if (write.count !== 1) {
        // Re-read once: the row is either gone or no longer ACTIVE.
        const current = await tx.customer.findFirst({
          where: { id: input.memberId, restaurantId: input.restaurantId },
        });
        if (!current) throw new MemberNotFoundError();
        throw new MemberStateError(
          'An anonymised member cannot be renamed',
          'MEMBER_ANONYMIZED'
        );
      }

      const updated = await tx.customer.findFirst({
        where: { id: input.memberId, restaurantId: input.restaurantId },
        include: { loyaltyCard: true },
      });
      if (!updated) throw new MemberNotFoundError();

      // Never store the old or new name: only that the field changed and
      // whether it now has a value. The purpose covers the full-phone read in
      // the response (§18.20.14 A).
      await tx.auditLog.create({
        data: auditData({
          tableName: 'customers',
          recordId: existing.id,
          operation: 'UPDATE',
          description: 'Member name updated',
          actor: input,
          oldValues: { hadName: existing.name !== null },
          newValues: { hasName: name !== null },
          metadata: {
            field: 'name',
            changed: (existing.name ?? null) !== name,
            cleared: name === null,
            purpose: 'member rename',
          },
        }),
      });

      return {
        body: {
          member: toMemberView(
            updated as unknown as MemberRow,
            input.revealPhone
          ),
        },
        receiptBody: {
          member: toReceiptMemberView(updated as unknown as MemberRow),
        },
        statusCode: 200,
      };
    },
  });

  let member = result.body.member;
  if (result.replayed) {
    // The receipt must not retain PII, so a replay re-reads the live,
    // tenant-scoped member instead of returning the masked receipt body.
    const current = await prisma.customer.findFirst({
      where: { id: input.memberId, restaurantId: input.restaurantId },
      include: { loyaltyCard: true },
    });
    if (!current) throw new MemberNotFoundError();
    member = toMemberView(current as unknown as MemberRow, input.revealPhone);
  }

  return {
    member,
    replayed: result.replayed,
    statusCode: result.statusCode,
  };
}

export interface ExportMemberInput {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
  memberId: string;
  purpose?: string | null;
  revealPhone: boolean;
}

export interface ExportMemberResult {
  member: MemberView;
}

/**
 * Subject-access export for one member. Unlike the marketing list export this
 * is allowed for any member of the restaurant, opted in or not. The audit row
 * carries the member id as its target; the CSV is streamed by the route.
 */
export async function exportMember(
  input: ExportMemberInput
): Promise<ExportMemberResult> {
  const row = await prisma.customer.findFirst({
    where: { id: input.memberId, restaurantId: input.restaurantId },
    include: { loyaltyCard: true },
  });
  if (!row) throw new MemberNotFoundError();

  await prisma.auditLog.create({
    data: auditData({
      tableName: 'customers',
      recordId: input.memberId,
      operation: 'EXPORT',
      description: 'Member data exported',
      actor: input,
      metadata: {
        targetType: 'MEMBER',
        target: input.memberId,
        purpose: cleanPurpose(input.purpose, 'Member export'),
        pii: input.revealPhone,
      },
    }),
  });

  return {
    member: toMemberView(row as unknown as MemberRow, input.revealPhone),
  };
}

export interface ExportMarketingMemberRow {
  id: string;
  name: string | null;
  phone: string | null;
  marketingConsentAt: string | null;
  marketingConsentVersion: string | null;
}

export interface ExportMarketingMembersInput {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
  purpose?: string | null;
  revealPhone: boolean;
}

export interface ExportMarketingMembersResult {
  rows: ExportMarketingMemberRow[];
  count: number;
}

/**
 * The contract's export surface is the marketing-opted-in list, not a single
 * member. Only ACTIVE members that currently opt in to marketing are included.
 * The caller streams the returned rows as CSV; no file is written.
 */
export async function exportMarketingMembers(
  input: ExportMarketingMembersInput
): Promise<ExportMarketingMembersResult> {
  const purpose = cleanPurpose(input.purpose, 'Marketing export');
  const rows = await prisma.customer.findMany({
    where: {
      restaurantId: input.restaurantId,
      status: 'ACTIVE',
      marketingOptIn: true,
    },
    orderBy: { marketingConsentAt: 'desc' },
    select: {
      id: true,
      name: true,
      phone: true,
      marketingConsentAt: true,
      marketingConsentVersion: true,
    },
  });

  await prisma.auditLog.create({
    data: auditData({
      tableName: 'customers',
      recordId: 'marketing-opt-in-list',
      operation: 'EXPORT',
      description: 'Marketing-opted-in members exported',
      actor: input,
      metadata: {
        target: 'marketing-opt-in-list',
        purpose,
        count: rows.length,
        scope: 'MARKETING_OPT_IN',
        pii: input.revealPhone,
      },
    }),
  });

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: input.revealPhone
        ? row.phone
        : row.phone
          ? maskPhone(row.phone)
          : null,
      marketingConsentAt: iso(row.marketingConsentAt),
      marketingConsentVersion: row.marketingConsentVersion,
    })),
    count: rows.length,
  };
}

function csvCell(value: string | null): string {
  if (value === null || value === undefined) return '';
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  return csvCell(String(value));
}

/** Serialise one member's subject-access export. */
export function memberToCsv(member: MemberView): string {
  const header = [
    'member_id',
    'name',
    'phone',
    'masked_phone',
    'status',
    'consent_at',
    'consent_version',
    'consent_source',
    'consent_withdrawn_at',
    'marketing_opt_in',
    'marketing_consent_at',
    'marketing_consent_version',
    'marketing_consent_source',
    'marketing_withdrawn_at',
    'anonymized_at',
    'last_visit_at',
    'visits_in_cycle',
    'visits_required',
    'cycle_number',
    'created_at',
    'updated_at',
  ].join(',');
  const row = [
    csvValue(member.id),
    csvValue(member.name),
    csvValue(member.phone),
    csvValue(member.maskedPhone),
    csvValue(member.status),
    csvValue(member.consentAt),
    csvValue(member.consentVersion),
    csvValue(member.consentSource),
    csvValue(member.consentWithdrawnAt),
    csvValue(member.marketingOptIn),
    csvValue(member.marketingConsentAt),
    csvValue(member.marketingConsentVersion),
    csvValue(member.marketingConsentSource),
    csvValue(member.marketingWithdrawnAt),
    csvValue(member.anonymizedAt),
    csvValue(member.lastVisitAt),
    csvValue(member.card?.visitsInCycle ?? null),
    csvValue(member.card?.visitsRequired ?? null),
    csvValue(member.card?.cycleNumber ?? null),
    csvValue(member.createdAt),
    csvValue(member.updatedAt),
  ].join(',');
  return `${header}\n${row}\n`;
}

/** Serialise the export rows. The route streams this string as a CSV body. */
export function marketingMembersToCsv(
  rows: ExportMarketingMemberRow[]
): string {
  const header = [
    'member_id',
    'name',
    'phone',
    'marketing_consent_at',
    'marketing_consent_version',
  ].join(',');
  const body = rows.map((row) =>
    [
      csvCell(row.id),
      csvCell(row.name),
      csvCell(row.phone),
      csvCell(row.marketingConsentAt),
      csvCell(row.marketingConsentVersion),
    ].join(',')
  );
  return [header, ...body].join('\n') + '\n';
}

export type ConsentWithdrawalScope = 'LOYALTY' | 'MARKETING';

export const ConsentWithdrawalScopeSchema = z.enum(['LOYALTY', 'MARKETING']);

export interface WithdrawMemberConsentInput {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
  memberId: string;
  scope: ConsentWithdrawalScope;
  revealPhone: boolean;
  idempotencyKey: string;
}

export interface WithdrawMemberConsentResult {
  member: MemberView;
  scope: ConsentWithdrawalScope;
  replayed: boolean;
  statusCode: number;
}

function withdrawalData(
  existing: MemberRow,
  scope: ConsentWithdrawalScope,
  now: Date
): Prisma.CustomerUpdateInput {
  const clearMarketing = {
    marketingOptIn: false,
    marketingWithdrawnAt: existing.marketingWithdrawnAt ?? now,
    marketingConsentAt: null,
    marketingConsentVersion: null,
    marketingConsentTextHash: null,
    marketingConsentSource: null,
  } satisfies Prisma.CustomerUpdateInput;

  if (scope === 'LOYALTY') {
    return {
      ...clearMarketing,
      consentWithdrawnAt: existing.consentWithdrawnAt ?? now,
    };
  }

  return clearMarketing;
}

/**
 * Withdraw loyalty or marketing consent.
 *
 * `LOYALTY` stops visit accrual/reward resolution (`consentWithdrawnAt`) and
 * also clears marketing. `MARKETING` clears marketing only; the loyalty
 * account and its consent record remain. Both are idempotent: an existing
 * withdrawal timestamp is never overwritten.
 */
export async function withdrawMemberConsent(
  input: WithdrawMemberConsentInput
): Promise<WithdrawMemberConsentResult> {
  const requestHash = stableRequestHash({
    restaurantId: input.restaurantId,
    memberId: input.memberId,
    scope: input.scope,
    actorId: input.actorId,
    revealPhone: input.revealPhone,
  });

  const result = await runIdempotentOwnerMutation<{
    member: MemberView;
    scope: ConsentWithdrawalScope;
  }>({
    restaurantId: input.restaurantId,
    action: 'members.withdraw_consent',
    key: input.idempotencyKey,
    requestHash,
    execute: async (tx: TransactionClient) => {
      const existing = await tx.customer.findFirst({
        where: { id: input.memberId, restaurantId: input.restaurantId },
        include: { loyaltyCard: true },
      });
      if (!existing) throw new MemberNotFoundError();

      const now = new Date();
      const row = existing as unknown as MemberRow;
      const updated = await tx.customer.update({
        where: { id: row.id },
        data: withdrawalData(row, input.scope, now),
        include: { loyaltyCard: true },
      });

      await tx.auditLog.create({
        data: auditData({
          tableName: 'customers',
          recordId: row.id,
          operation: 'UPDATE',
          description:
            input.scope === 'LOYALTY'
              ? 'Loyalty consent withdrawn'
              : 'Marketing consent withdrawn',
          actor: input,
          oldValues: {
            scope: input.scope,
            consentWithdrawnAt: iso(row.consentWithdrawnAt),
            marketingOptIn: row.marketingOptIn,
            marketingWithdrawnAt: iso(row.marketingWithdrawnAt),
          },
          newValues: {
            scope: input.scope,
            consentWithdrawnAt: iso(updated.consentWithdrawnAt),
            marketingOptIn: updated.marketingOptIn,
            marketingWithdrawnAt: iso(updated.marketingWithdrawnAt),
          },
          metadata: { scope: input.scope },
        }),
      });

      return {
        body: {
          member: toMemberView(
            updated as unknown as MemberRow,
            input.revealPhone
          ),
          scope: input.scope,
        },
        receiptBody: {
          member: toReceiptMemberView(updated as unknown as MemberRow),
          scope: input.scope,
        },
        statusCode: 200,
      };
    },
  });

  return {
    member: result.body.member,
    scope: result.body.scope,
    replayed: result.replayed,
    statusCode: result.statusCode,
  };
}

export interface RecordMarketingConsentInput {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
  memberId: string;
  purpose?: string | null;
  revealPhone: boolean;
  idempotencyKey: string;
}

export interface RecordMarketingConsentResult {
  member: MemberView;
  noticeVersion: string;
  replayed: boolean;
  statusCode: number;
}

/**
 * Record marketing opt-in with the server-derived notice version/hash.
 *
 * Marketing consent is forbidden when loyalty consent was withdrawn, when the
 * member never consented, or when the member is anonymised. The actor comes
 * from the authenticated context; a staff actor is recorded as `COUNTER` and an
 * owner actor as `OWNER`.
 */
export async function recordMarketingConsent(
  input: RecordMarketingConsentInput
): Promise<RecordMarketingConsentResult> {
  const requestHash = stableRequestHash({
    restaurantId: input.restaurantId,
    memberId: input.memberId,
    action: 'marketing-consent',
    actorId: input.actorId,
    revealPhone: input.revealPhone,
  });

  const result = await runIdempotentOwnerMutation<{
    member: MemberView;
    noticeVersion: string;
  }>({
    restaurantId: input.restaurantId,
    action: 'members.marketing_consent',
    key: input.idempotencyKey,
    requestHash,
    execute: async (tx: TransactionClient) => {
      const existing = await tx.customer.findFirst({
        where: { id: input.memberId, restaurantId: input.restaurantId },
        include: { loyaltyCard: true },
      });
      if (!existing) throw new MemberNotFoundError();

      if (existing.status === 'ANONYMIZED') {
        throw new MemberStateError(
          'An anonymised member cannot receive marketing consent',
          'MEMBER_ANONYMIZED'
        );
      }
      if (existing.consentWithdrawnAt) {
        throw new MemberStateError(
          'Marketing consent is unavailable after loyalty consent was withdrawn',
          'CONSENT_WITHDRAWN'
        );
      }
      if (!existing.consentAt) {
        throw new MemberStateError(
          'Loyalty consent is required before marketing consent',
          'CONSENT_REQUIRED'
        );
      }

      const settings = await tx.loyaltySettings.findUnique({
        where: { restaurantId: input.restaurantId },
      });
      const notice = resolveNotice(settings);
      if (!notice) {
        throw new MemberStateError(
          'The rewards notice is not configured',
          'LOYALTY_DISABLED'
        );
      }

      const now = new Date();
      const source = input.actorType === 'staff' ? 'COUNTER' : 'OWNER';
      const updated = await tx.customer.update({
        where: { id: existing.id },
        data: {
          marketingOptIn: true,
          marketingConsentAt: now,
          marketingConsentVersion: notice.version,
          marketingConsentTextHash: notice.textHash,
          marketingConsentSource: source,
          marketingWithdrawnAt: null,
        },
        include: { loyaltyCard: true },
      });

      await tx.auditLog.create({
        data: auditData({
          tableName: 'customers',
          recordId: existing.id,
          operation: 'UPDATE',
          description: 'Marketing consent recorded',
          actor: input,
          oldValues: {
            marketingOptIn: existing.marketingOptIn,
            marketingConsentVersion: existing.marketingConsentVersion,
            marketingWithdrawnAt: iso(existing.marketingWithdrawnAt),
          },
          newValues: {
            marketingOptIn: true,
            marketingConsentVersion: notice.version,
            marketingConsentSource: source,
            marketingWithdrawnAt: null,
          },
          metadata: {
            purpose: cleanPurpose(input.purpose, 'Marketing consent'),
            noticeVersion: notice.version,
            source,
          },
        }),
      });

      return {
        body: {
          member: toMemberView(
            updated as unknown as MemberRow,
            input.revealPhone
          ),
          noticeVersion: notice.version,
        },
        receiptBody: {
          member: toReceiptMemberView(updated as unknown as MemberRow),
          noticeVersion: notice.version,
        },
        statusCode: 200,
      };
    },
  });

  return {
    member: result.body.member,
    noticeVersion: result.body.noticeVersion,
    replayed: result.replayed,
    statusCode: result.statusCode,
  };
}

export interface DeleteMemberInput {
  restaurantId: string;
  actorId: string;
  actorType?: string | null;
  memberId: string;
  idempotencyKey: string;
}

export interface DeleteMemberResult {
  member: MemberView;
  ordersAnonymised: number;
  replayed: boolean;
  statusCode: number;
}

/**
 * Anonymise a member in place. There is no hard delete (§18.20.9):
 *
 * - `Customer.phone`/`name` become null and `status='ANONYMIZED'`;
 * - `phoneHash` and every financial row are retained;
 * - `Order.customerName`/`customerPhone` are nulled for the member's orders,
 *   including orders linked through the bill's `DiningSession`
 *   (REVIEW-05 F-05);
 * - marketing consent is cleared.
 */
export async function deleteMember(
  input: DeleteMemberInput
): Promise<DeleteMemberResult> {
  const requestHash = stableRequestHash({
    restaurantId: input.restaurantId,
    memberId: input.memberId,
    action: 'anonymise',
    actorId: input.actorId,
  });

  const result = await runIdempotentOwnerMutation<{
    member: MemberView;
    ordersAnonymised: number;
  }>({
    restaurantId: input.restaurantId,
    action: 'members.delete',
    key: input.idempotencyKey,
    requestHash,
    execute: async (tx: TransactionClient) => {
      const existing = await tx.customer.findFirst({
        where: { id: input.memberId, restaurantId: input.restaurantId },
        include: { loyaltyCard: true },
      });
      if (!existing) throw new MemberNotFoundError();

      const now = new Date();

      // The order copy of the member is PII. Null it for direct member orders
      // and for every order on a dining session whose authoritative member is
      // this customer. Never touch the financial columns.
      const memberOrders = await tx.order.findMany({
        where: {
          restaurantId: input.restaurantId,
          OR: [
            { customerId: existing.id },
            { diningSession: { is: { customerId: existing.id } } },
          ],
        },
        select: { id: true, customerSessionId: true },
      });
      const memberOrderIds = memberOrders.map((order) => order.id);
      const customerSessionIds = Array.from(
        new Set(
          memberOrders
            .map((order) => order.customerSessionId)
            .filter((value): value is string => Boolean(value))
        )
      );

      // QR order create copies `customerInfo` into `customer_sessions`; the
      // owner order endpoints read it from there. Null those copies too, in
      // the same tenant-scoped transaction (REVIEW-05 F-05, §18.20.9).
      //
      // A guest order from an existing member carries no `Order.customerId`,
      // so the order join alone misses its session. QR create now stores the
      // E.164 value, so one equality check covers every new row (R-01).
      const sessionConditions: Prisma.CustomerSessionWhereInput[] = [];
      if (customerSessionIds.length > 0) {
        sessionConditions.push({ id: { in: customerSessionIds } });
      }
      if (existing.phone) {
        sessionConditions.push({ customerPhone: existing.phone });
      }

      const sessionUpdate =
        sessionConditions.length > 0
          ? await tx.customerSession.updateMany({
              where: {
                table: { restaurantId: input.restaurantId },
                OR: sessionConditions,
              },
              data: {
                customerName: null,
                customerPhone: null,
                customerEmail: null,
              },
            })
          : { count: 0 };

      // P7b-1: `Order.idempotencyHash` is deliberately retained here. The
      // counter replay path compares it to a freshly computed digest; nulling
      // it would turn every legitimate retry after anonymisation into
      // `IDEMPOTENCY_MISMATCH`. It is keyed with `hashPhone` when the key is
      // configured, and otherwise omits the phone and name from the digest, so
      // it is not brute-forceable either way.
      const orderUpdate = await tx.order.updateMany({
        where: {
          restaurantId: input.restaurantId,
          OR: [
            { customerId: existing.id },
            { diningSession: { is: { customerId: existing.id } } },
          ],
        },
        data: { customerName: null, customerPhone: null },
      });

      // Station events keep the customer name for kitchen display, so erase it
      // from the member's event payloads too. Phone/email are never written to
      // these payloads. The payload is JSON, so update the rows individually.
      const memberEvents =
        memberOrderIds.length > 0
          ? await tx.orderEvent.findMany({
              where: {
                restaurantId: input.restaurantId,
                orderId: { in: memberOrderIds },
              },
              select: { id: true, payload: true },
            })
          : [];
      let orderEventsAnonymised = 0;
      for (const event of memberEvents) {
        const payload = event.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          continue;
        }
        const record = payload as Record<string, unknown>;
        const hasCustomerName =
          record.customerName !== null && record.customerName !== undefined;
        const hasPhone = 'customerPhone' in record;
        const hasEmail = 'customerEmail' in record;
        if (!hasCustomerName && !hasPhone && !hasEmail) {
          continue;
        }
        const scrubbed: Record<string, unknown> = {
          ...record,
          customerName: null,
        };
        delete scrubbed.customerPhone;
        delete scrubbed.customerEmail;
        await tx.orderEvent.update({
          where: { id: event.id },
          data: {
            payload: scrubbed as Prisma.InputJsonValue,
          },
        });
        orderEventsAnonymised += 1;
      }

      const updated = await tx.customer.update({
        where: { id: existing.id },
        data: {
          status: 'ANONYMIZED',
          anonymizedAt: existing.anonymizedAt ?? now,
          phone: null,
          name: null,
          consentWithdrawnAt: existing.consentWithdrawnAt ?? now,
          marketingOptIn: false,
          marketingWithdrawnAt: existing.marketingWithdrawnAt ?? now,
          marketingConsentAt: null,
          marketingConsentVersion: null,
          marketingConsentTextHash: null,
          marketingConsentSource: null,
        },
        include: { loyaltyCard: true },
      });

      await tx.auditLog.create({
        data: auditData({
          tableName: 'customers',
          recordId: existing.id,
          operation: 'DELETE',
          description: 'Member anonymised',
          actor: input,
          oldValues: {
            status: existing.status,
            hadPhone: existing.phone !== null,
            hadName: existing.name !== null,
            marketingOptIn: existing.marketingOptIn,
          },
          newValues: {
            status: 'ANONYMIZED',
            ordersAnonymised: orderUpdate.count,
            customerSessionsAnonymised: sessionUpdate.count,
            orderEventsAnonymised,
            marketingOptIn: false,
          },
          metadata: {
            ordersAnonymised: orderUpdate.count,
            customerSessionsAnonymised: sessionUpdate.count,
            orderEventsAnonymised,
          },
        }),
      });

      return {
        body: {
          member: toMemberView(updated as unknown as MemberRow, false),
          ordersAnonymised: orderUpdate.count,
        },
        statusCode: 200,
      };
    },
  });

  return {
    member: result.body.member,
    ordersAnonymised: result.body.ordersAnonymised,
    replayed: result.replayed,
    statusCode: result.statusCode,
  };
}
