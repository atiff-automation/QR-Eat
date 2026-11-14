/**
 * Loyalty enumeration detection and security events (§18.20.15 B, P7 plan Q5,
 * P7c 2026-11-14).
 *
 * A phone-hash miss is a supplied phone that resolves to no ACTIVE member
 * during a QR quote/create. Each miss writes an `info` `SecurityEvent` carrying
 * only the keyed `phoneHash`. When one trusted IP accumulates five distinct
 * `phoneHash` misses inside ten minutes for one restaurant, one `warning` alert
 * is written. Every event carries `restaurantId`, so misses from two restaurants
 * that share an IP cannot aggregate into one platform-wide alert (M-3).
 *
 * P7c adds the refusal recorder: one `loyalty_rate_limited` event per
 * `(restaurantId, subject, window)`, so a burst cannot flood the table. The
 * subject is always a bucket identifier — a phone hash, a session id, an IP or
 * the restaurant id — never a raw phone number.
 *
 * Detection only: nothing here refuses, delays or changes the response, and a
 * storage failure is swallowed. The raw phone is never passed to this module,
 * so it cannot appear in `SecurityEvent.eventData`, a log or a response.
 */

import { prisma, type TransactionClient } from '@/lib/database';
import { windowStart, type RateLimitScope } from './rate-limit';

export const LOOKUP_MISS_EVENT = 'loyalty_lookup_miss';
export const ENUMERATION_ALERT_EVENT = 'loyalty_enumeration_alert';
export const RATE_LIMITED_EVENT = 'loyalty_rate_limited';
export const RATE_LIMIT_UNAVAILABLE_EVENT = 'loyalty_rate_limit_unavailable';
export const ENUMERATION_WINDOW_MS = 10 * 60 * 1000;
export const ENUMERATION_MISS_THRESHOLD = 5;

/** Advisory-lock namespace so alerts for one IP serialise across requests. */
const ENUMERATION_LOCK_PREFIX = 'loyalty-enumeration:';
const RATE_LIMIT_LOCK_PREFIX = 'loyalty-rate-limited:';

export interface LoyaltyLookupMissInput {
  restaurantId: string;
  /** Trusted edge IP, never a client-supplied header. */
  ip: string;
  /** Keyed HMAC of the supplied phone. Never the phone itself. */
  phoneHash: string;
  requestPath: string;
  now?: Date;
}

export interface RateLimitedEventInput {
  restaurantId: string;
  /** The bucket that refused the attempt. */
  scope: RateLimitScope;
  /** Trusted edge IP, never a client-supplied header. */
  ip: string;
  /**
   * The bucket subject: phone hash, QR session id, IP or restaurant id. Never a
   * raw phone number. Optional because the caller may not have resolved one.
   */
  subject?: string | null;
  now?: Date;
}

export interface RateLimitUnavailableInput {
  restaurantId: string;
  /** Trusted edge IP, never a client-supplied header. */
  ip: string;
  now?: Date;
}

function distinctMisses(
  rows: ReadonlyArray<{ eventData: unknown }>
): Set<string> {
  const hashes = new Set<string>();
  for (const row of rows) {
    const data = row.eventData;
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    const hash = (data as Record<string, unknown>).phoneHash;
    if (typeof hash === 'string' && hash.length > 0) hashes.add(hash);
  }
  return hashes;
}

async function writeAlertIfNeeded(
  tx: TransactionClient,
  input: LoyaltyLookupMissInput,
  now: Date
): Promise<void> {
  const since = new Date(now.getTime() - ENUMERATION_WINDOW_MS);

  // One alert per restaurant and IP per window even when misses land
  // concurrently.
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`${ENUMERATION_LOCK_PREFIX}${input.restaurantId}:${input.ip}`})::bigint
    )::text AS lock
  `;

  const misses = await tx.securityEvent.findMany({
    where: {
      restaurantId: input.restaurantId,
      eventType: LOOKUP_MISS_EVENT,
      ipAddress: input.ip,
      createdAt: { gte: since },
    },
    select: { eventData: true },
  });
  const distinct = distinctMisses(misses);
  if (distinct.size < ENUMERATION_MISS_THRESHOLD) return;

  const existing = await tx.securityEvent.findFirst({
    where: {
      restaurantId: input.restaurantId,
      eventType: ENUMERATION_ALERT_EVENT,
      ipAddress: input.ip,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (existing) return;

  await tx.securityEvent.create({
    data: {
      restaurantId: input.restaurantId,
      eventType: ENUMERATION_ALERT_EVENT,
      severity: 'warning',
      ipAddress: input.ip,
      requestPath: input.requestPath,
      eventData: { distinctPhoneHashes: distinct.size },
      createdAt: now,
    },
  });
}

/**
 * Record one phone-hash miss and, at the threshold, one enumeration alert.
 *
 * Every failure is swallowed: detection must never block or alter a quote or
 * create response.
 */
export async function recordLoyaltyLookupMiss(
  input: LoyaltyLookupMissInput
): Promise<void> {
  const now = input.now ?? new Date();

  try {
    await prisma.securityEvent.create({
      data: {
        restaurantId: input.restaurantId,
        eventType: LOOKUP_MISS_EVENT,
        severity: 'info',
        ipAddress: input.ip,
        requestPath: input.requestPath,
        eventData: { phoneHash: input.phoneHash },
        createdAt: now,
      },
    });
  } catch {
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await writeAlertIfNeeded(tx, input, now);
    });
  } catch {
    // Detection only. A failed alert never affects the request.
  }
}

/**
 * Record one rate-limit refusal, deduped per `(restaurantId, subject, window)`.
 *
 * The event is a `warning` with `scope` and the bucket `subject`. For
 * `PHONE_HASH` the subject is the keyed hash, never the phone. A burst of
 * refusals inside one fixed hourly window writes exactly one row.
 *
 * Every failure is swallowed: recording a refusal must never turn a 429 into a
 * 500.
 */
export async function recordRateLimited(
  input: RateLimitedEventInput
): Promise<void> {
  const now = input.now ?? new Date();
  const start = windowStart(now);
  const subject = input.subject?.trim() ? input.subject.trim() : null;

  // Never store anything that is not a hash-shaped phone subject. The routes
  // pass the limiter's bucket subject, but this guard makes a mistaken caller
  // unable to write a raw phone into `security_events`.
  if (
    input.scope === 'PHONE_HASH' &&
    (subject === null || !/^[a-f0-9]{64}$/i.test(subject))
  ) {
    return;
  }

  const lockKey = `${RATE_LIMIT_LOCK_PREFIX}${input.restaurantId}:${
    input.scope
  }:${subject ?? ''}:${start.toISOString()}`;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
      `;

      const existing = await tx.securityEvent.findFirst({
        where: {
          restaurantId: input.restaurantId,
          eventType: RATE_LIMITED_EVENT,
          createdAt: { gte: start },
          ...(subject
            ? { eventData: { path: ['subject'], equals: subject } }
            : { eventData: { path: ['scope'], equals: input.scope } }),
        },
        select: { id: true },
      });
      if (existing) return;

      await tx.securityEvent.create({
        data: {
          restaurantId: input.restaurantId,
          eventType: RATE_LIMITED_EVENT,
          severity: 'warning',
          ipAddress: input.ip,
          eventData: subject
            ? { scope: input.scope, subject }
            : { scope: input.scope },
          createdAt: now,
        },
      });
    });
  } catch {
    // Recording is advisory. A failed write never changes the refusal.
  }
}

/**
 * Record that the limiter could not run (fail-open), deduped per restaurant and
 * hourly window. This is not a refusal: the request was allowed.
 *
 * Every failure is swallowed; the caller has already decided to proceed.
 */
export async function recordRateLimitUnavailable(
  input: RateLimitUnavailableInput
): Promise<void> {
  const now = input.now ?? new Date();
  const start = windowStart(now);
  const lockKey = `${RATE_LIMIT_LOCK_PREFIX}unavailable:${
    input.restaurantId
  }:${start.toISOString()}`;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
      `;

      const existing = await tx.securityEvent.findFirst({
        where: {
          restaurantId: input.restaurantId,
          eventType: RATE_LIMIT_UNAVAILABLE_EVENT,
          createdAt: { gte: start },
        },
        select: { id: true },
      });
      if (existing) return;

      await tx.securityEvent.create({
        data: {
          restaurantId: input.restaurantId,
          eventType: RATE_LIMIT_UNAVAILABLE_EVENT,
          severity: 'warning',
          ipAddress: input.ip,
          eventData: { reason: 'counter_unavailable' },
          createdAt: now,
        },
      });
    });
  } catch {
    // The database is likely the thing that failed. Nothing else to do.
  }
}
