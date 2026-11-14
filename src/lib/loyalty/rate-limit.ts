/**
 * Durable hourly rate limits for QR loyalty lookups (§18.20.15 B, P7a Q1).
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
 * The counters table is created by the P1 migration. This module never stores a
 * phone number: the `PHONE_HASH` subject is the keyed HMAC from `phone.ts`.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/database';
import { hashPhone, normalisePhone } from './phone';
import { UNKNOWN_TRUSTED_IP } from './trusted-ip';

/** The four scopes allowed by the `rate_limit_counters_scope_check` CHECK. */
export type RateLimitScope =
  | 'PHONE_HASH'
  | 'RESTAURANT'
  | 'QR_SESSION'
  | 'EDGE_IP';

/** Fixed window length. One hour per §18.20.15 B. */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Contract limits, requests per fixed hourly window. */
export const RATE_LIMITS: Readonly<Record<RateLimitScope, number>> = {
  /** 10 per `(restaurantId, phoneHash)` per hour. */
  PHONE_HASH: 10,
  /** 30 per restaurant per hour. */
  RESTAURANT: 30,
  /** 10 per QR session per hour. */
  QR_SESSION: 10,
  /** 20 per trusted edge IP per hour. */
  EDGE_IP: 20,
};

/** Strictest configured limit, used for the shared `unknown` IP bucket. */
export const STRICTEST_RATE_LIMIT = Math.min(...Object.values(RATE_LIMITS));

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
}

/** A typed refusal. The route must expose only `code` and `retryAfterSeconds`. */
export interface RateLimitRefusal {
  code: 'RATE_LIMITED';
  /** Seconds until the current fixed window ends. Always positive. */
  retryAfterSeconds: number;
  limit: number;
  count: number;
  scope: RateLimitScope;
}

/** Floor `now` to the start of its UTC hour. */
export function windowStart(now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCMinutes(0, 0, 0);
  return start;
}

/** Seconds until the current window ends, rounded up and never below 1. */
export function retryAfterSeconds(now: Date): number {
  const end = windowStart(now).getTime() + RATE_LIMIT_WINDOW_MS;
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

/**
 * Increment one bucket with a single atomic upsert and return the new count.
 *
 * `id` is supplied explicitly because the Prisma `@default(uuid())` is
 * client-side and the database column has no default.
 */
export async function incrementRateLimit(
  bucket: RateLimitBucket,
  now: Date = new Date()
): Promise<number> {
  const start = windowStart(now);

  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
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

/**
 * The strictest limit applies to the shared `unknown` address: when the edge
 * cannot identify the caller, every such caller shares one bucket at the
 * lowest configured limit (§18.20.15 B).
 */
function limitFor(bucket: RateLimitBucket): number {
  if (bucket.scope === 'EDGE_IP' && bucket.subject === UNKNOWN_TRUSTED_IP) {
    return STRICTEST_RATE_LIMIT;
  }
  return RATE_LIMITS[bucket.scope];
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
    subject: input.ip.length > 0 ? input.ip : UNKNOWN_TRUSTED_IP,
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
 * Apply every applicable bucket to an attempt.
 *
 * Each bucket is incremented atomically and checked in turn. The first bucket
 * over its limit refuses the attempt, so an enumeration request never reaches
 * phone/member resolution. The refusal carries only the retry window; the route
 * must not serialise `scope`, `count` or `limit`.
 */
export async function enforceRateLimits(
  input: RateLimitSubjectInput,
  now: Date = new Date()
): Promise<RateLimitRefusal | null> {
  const seconds = retryAfterSeconds(now);

  for (const bucket of buildBuckets(input)) {
    const count = await incrementRateLimit(bucket, now);
    const limit = limitFor(bucket);

    if (count > limit) {
      return {
        code: 'RATE_LIMITED',
        retryAfterSeconds: seconds,
        limit,
        count,
        scope: bucket.scope,
      };
    }
  }

  return null;
}
