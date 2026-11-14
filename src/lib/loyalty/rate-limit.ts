/**
 * Durable hourly rate limits for QR loyalty lookups (§18.20.15 B, P7a Q1,
 * P7c rebalance 2026-11-14).
 *
 * Every bucket is a single atomic Postgres statement:
 *
 *   INSERT … ON CONFLICT (restaurantId, scope, subject, windowStart)
 *   DO UPDATE SET count = rate_limit_counters.count + 1
 *   RETURNING count
 *
 * There is deliberately no read-then-write: two concurrent requests can never
 * both read the same count and overwrite each other. Windows are fixed hours
 * (`windowStart` is `now` floored to the hour); a burst can straddle a boundary
 * and that is accepted for abuse control.
 *
 * P7c rules:
 *
 * - A request with **no phone** is skipped entirely. A guest quote cannot
 *   enumerate a member, and counting it exhausted the shared restaurant and
 *   edge-IP buckets for real customers.
 * - The per-phone and per-session limits stay at the contract's 10/hour; the
 *   per-restaurant ceiling comes from `LoyaltySettings.lookupLimitPerHour`
 *   (default 30, range 1–1000); the per-IP floor is 120/hour.
 * - All buckets are incremented in one transaction, so a refusal rolls every
 *   increment back and one client cannot exhaust a shared bucket.
 * - A database error fails **open**: the caller proceeds, one generic line is
 *   logged and no refusal is produced. The counter shares a database with the
 *   lookup, so a counter outage already means the lookup is down; payments stay
 *   fail-closed.
 *
 * The counters table is created by the P1 migration. This module never stores a
 * phone number: the `PHONE_HASH` subject is the keyed HMAC from `phone.ts`.
 */

import { randomUUID } from 'node:crypto';
import { prisma, type TransactionClient } from '@/lib/database';
import { hashPhone, normalisePhone } from './phone';
import { UNKNOWN_TRUSTED_IP } from '../client-ip';

/** The four scopes allowed by the `rate_limit_counters_scope_check` CHECK. */
export type RateLimitScope =
  | 'PHONE_HASH'
  | 'RESTAURANT'
  | 'QR_SESSION'
  | 'EDGE_IP';

/** Fixed window length. One hour per §18.20.15 B. */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Contract limits, requests per fixed hourly window. `RESTAURANT` is only the
 * default ceiling: the live value comes from `LoyaltySettings`.
 */
export const RATE_LIMITS: Readonly<Record<RateLimitScope, number>> = {
  /** 10 per `(restaurantId, phoneHash)` per hour. */
  PHONE_HASH: 10,
  /** Default 30 per restaurant per hour; owner-configurable 1–1000. */
  RESTAURANT: 30,
  /** 10 per QR session per hour. */
  QR_SESSION: 10,
  /** 120 per trusted edge IP per hour. Coarse abuse control only. */
  EDGE_IP: 120,
};

/** The limits applied to one attempt. */
export interface RateLimitLimits {
  phoneHash: number;
  session: number;
  restaurant: number;
  edgeIp: number;
}

export const DEFAULT_RATE_LIMITS: Readonly<RateLimitLimits> = {
  phoneHash: RATE_LIMITS.PHONE_HASH,
  session: RATE_LIMITS.QR_SESSION,
  restaurant: RATE_LIMITS.RESTAURANT,
  edgeIp: RATE_LIMITS.EDGE_IP,
};

/** Strictest default limit, used for the shared `unknown` IP bucket. */
export const STRICTEST_RATE_LIMIT = Math.min(
  ...Object.values(DEFAULT_RATE_LIMITS)
);

/**
 * OWASP advises against a precise `Retry-After` an attacker can schedule
 * against. Round up to the next ten seconds.
 */
export const RETRY_AFTER_ROUNDING_SECONDS = 10;

/** A single counter bucket. */
export interface RateLimitBucket {
  restaurantId: string;
  scope: RateLimitScope;
  subject: string;
}

/** Inputs that identify the caller of a quote/create attempt. */
export interface RateLimitSubjectInput {
  restaurantId: string;
  /** The resolved QR cart session, when one exists. */
  sessionId?: string | null;
  /** Raw customer phone, when supplied. Normalised and hashed here. */
  phone?: string | null;
  /** Result of `trustedIp(request)`. */
  ip: string;
  /** Per-restaurant ceiling and any other override for this attempt. */
  limits?: Partial<RateLimitLimits> | null;
}

/** A typed refusal. The route must expose only `code` and `retryAfterSeconds`. */
export interface RateLimitRefusal {
  code: 'RATE_LIMITED';
  /**
   * Seconds until the current fixed window ends, rounded up to the next ten
   * seconds. Always positive.
   */
  retryAfterSeconds: number;
  limit: number;
  count: number;
  scope: RateLimitScope;
  /**
   * The bucket subject. For `PHONE_HASH` this is the keyed hash, never the
   * phone. Internal only: the route must not serialise it.
   */
  subject: string;
}

/**
 * The outcome of one enforcement attempt. `failedOpen` means the counter could
 * not be read/written; the caller must proceed and must not record a refusal.
 */
export interface RateLimitDecision {
  allowed: boolean;
  refusal: RateLimitRefusal | null;
  failedOpen: boolean;
}

/** Floor `now` to the start of its UTC hour. */
export function windowStart(now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCMinutes(0, 0, 0);
  return start;
}

/** Seconds until the current window ends, rounded up and never below 10. */
export function retryAfterSeconds(now: Date): number {
  const end = windowStart(now).getTime() + RATE_LIMIT_WINDOW_MS;
  const remaining = Math.max(1, Math.ceil((end - now.getTime()) / 1000));
  return (
    Math.ceil(remaining / RETRY_AFTER_ROUNDING_SECONDS) *
    RETRY_AFTER_ROUNDING_SECONDS
  );
}

/**
 * Increment one bucket with a single atomic upsert and return the new count.
 *
 * `id` is supplied explicitly because the Prisma `@default(uuid())` is
 * client-side and the database column has no default.
 *
 * The client parameter lets `enforceRateLimits` run the upsert inside the same
 * transaction as the other buckets, so a refusal can roll every increment back.
 */
async function incrementWith(
  client: Pick<TransactionClient, '$queryRaw'>,
  bucket: RateLimitBucket,
  now: Date
): Promise<number> {
  const start = windowStart(now);

  const rows = await client.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "rate_limit_counters"
      ("id", "restaurantId", "scope", "subject", "windowStart", "count")
    VALUES
      (${randomUUID()}, ${bucket.restaurantId}, ${bucket.scope}, ${bucket.subject}, ${start}, 1)
    ON CONFLICT ("restaurantId", "scope", "subject", "windowStart")
    DO UPDATE SET "count" = "rate_limit_counters"."count" + 1
    RETURNING "count"
  `;

  const row = rows[0];
  if (!row) {
    throw new Error('Rate limit counter did not return a count.');
  }

  return Number(row.count);
}

/** Increment one bucket outside an explicit transaction. */
export async function incrementRateLimit(
  bucket: RateLimitBucket,
  now: Date = new Date()
): Promise<number> {
  return incrementWith(prisma, bucket, now);
}

/** Resolve the effective limits for one attempt. */
function resolveLimits(
  overrides: Partial<RateLimitLimits> | null | undefined
): RateLimitLimits {
  return {
    phoneHash: overrides?.phoneHash ?? DEFAULT_RATE_LIMITS.phoneHash,
    session: overrides?.session ?? DEFAULT_RATE_LIMITS.session,
    restaurant: overrides?.restaurant ?? DEFAULT_RATE_LIMITS.restaurant,
    edgeIp: overrides?.edgeIp ?? DEFAULT_RATE_LIMITS.edgeIp,
  };
}

/**
 * The per-restaurant subject used when the edge cannot identify the caller.
 * Scoping the sentinel per tenant means one restaurant's traffic cannot exhaust
 * the whole deployment's budget (P7c F-02).
 */
function unknownIpSubject(restaurantId: string): string {
  return `${UNKNOWN_TRUSTED_IP}:${restaurantId}`;
}

/** True for the shared sentinel and its per-restaurant scoped form. */
function isUnknownIpSubject(subject: string): boolean {
  return (
    subject === UNKNOWN_TRUSTED_IP ||
    subject.startsWith(`${UNKNOWN_TRUSTED_IP}:`)
  );
}

/**
 * The strictest limit applies to an untrusted address: when the edge cannot
 * identify the caller, every such caller for that restaurant shares one bucket
 * at the lowest configured limit (§18.20.15 B, P7c F-02).
 */
function limitFor(bucket: RateLimitBucket, limits: RateLimitLimits): number {
  if (bucket.scope === 'EDGE_IP' && isUnknownIpSubject(bucket.subject)) {
    return Math.min(
      limits.phoneHash,
      limits.session,
      limits.restaurant,
      limits.edgeIp
    );
  }

  switch (bucket.scope) {
    case 'PHONE_HASH':
      return limits.phoneHash;
    case 'QR_SESSION':
      return limits.session;
    case 'EDGE_IP':
      return limits.edgeIp;
    case 'RESTAURANT':
      return limits.restaurant;
  }
}

function buildBuckets(input: RateLimitSubjectInput): RateLimitBucket[] {
  const base = { restaurantId: input.restaurantId };

  const buckets: RateLimitBucket[] = [
    { ...base, scope: 'RESTAURANT', subject: input.restaurantId },
  ];

  if (input.sessionId) {
    buckets.push({ ...base, scope: 'QR_SESSION', subject: input.sessionId });
  }

  buckets.push({
    ...base,
    scope: 'EDGE_IP',
    subject:
      input.ip.length > 0 && input.ip !== UNKNOWN_TRUSTED_IP
        ? input.ip
        : unknownIpSubject(input.restaurantId),
  });

  if (input.phone) {
    const normalised = normalisePhone(input.phone);
    if (normalised.ok) {
      try {
        buckets.push({
          ...base,
          scope: 'PHONE_HASH',
          subject: hashPhone(normalised.phone),
        });
      } catch {
        // A missing HMAC key makes the member path fail closed anyway. The
        // other three buckets still protect the endpoint.
      }
    }
  }

  return buckets;
}

/**
 * Internal signal thrown inside the transaction so a refusal rolls back every
 * increment performed by the attempt. It never escapes this module.
 */
class RateLimitRefusalSignal extends Error {
  constructor(readonly refusal: RateLimitRefusal) {
    super('Rate limit refused');
    this.name = 'RateLimitRefusalSignal';
  }
}

/**
 * Apply every applicable bucket to an attempt.
 *
 * A request with no phone returns `allowed` immediately and writes nothing: a
 * guest quote cannot enumerate. Otherwise all buckets are incremented in one
 * interactive transaction, each with its single atomic upsert. When any bucket
 * is over its limit the transaction is rolled back and the attempt consumes
 * nothing. The first over-limit bucket wins; the refusal carries only the retry
 * window. The route must not serialise `scope`, `count`, `limit` or `subject`.
 *
 * A database error fails open with one generic log line and no refusal.
 */
export async function enforceRateLimits(
  input: RateLimitSubjectInput,
  now: Date = new Date()
): Promise<RateLimitDecision> {
  // No phone, nothing to enumerate. Guest requests must never consume a shared
  // bucket (P7c).
  if (!input.phone || input.phone.trim().length === 0) {
    return { allowed: true, refusal: null, failedOpen: false };
  }

  const seconds = retryAfterSeconds(now);
  const limits = resolveLimits(input.limits);
  const buckets = buildBuckets(input);

  try {
    const refusal = await prisma.$transaction(async (tx) => {
      for (const bucket of buckets) {
        const count = await incrementWith(tx, bucket, now);
        const limit = limitFor(bucket, limits);

        if (count > limit) {
          throw new RateLimitRefusalSignal({
            code: 'RATE_LIMITED',
            retryAfterSeconds: seconds,
            limit,
            count,
            scope: bucket.scope,
            subject: bucket.subject,
          });
        }
      }

      return null;
    });

    return { allowed: refusal === null, refusal, failedOpen: false };
  } catch (error) {
    if (error instanceof RateLimitRefusalSignal) {
      return { allowed: false, refusal: error.refusal, failedOpen: false };
    }

    // Fail open. Never log the error object: a Prisma error can embed its
    // parameters, including the IP or phone-hash subject.
    console.error(
      'Loyalty rate limiter unavailable; allowing the request (fail-open).'
    );
    return { allowed: true, refusal: null, failedOpen: true };
  }
}
