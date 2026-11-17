/**
 * Retention for short-lived loyalty artifacts (REVIEW-29 D-2).
 *
 * `quotes` are single-use price locks with a 10-minute TTL, but nothing deleted
 * them once expired: a public QR path could grow the table forever.
 * `idempotency_records` carry an explicit `expiresAt` and are read only while
 * unexpired, so expired rows are dead weight too.
 *
 * Both deletes are idempotent: a second run over the same window removes zero
 * rows. The caller (`/api/cron/cleanup-events`) owns authentication and
 * scheduling; this module is plain database work.
 */

import { prisma } from '@/lib/database';

/** Keep a full day past expiry so a delayed retry can still read the quote. */
export const QUOTE_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Quotes whose expiry is older than the retention window. */
export function expiredQuoteCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - QUOTE_RETENTION_MS);
}

export async function cleanupExpiredQuotes(
  now: Date = new Date()
): Promise<number> {
  const result = await prisma.quote.deleteMany({
    where: { expiresAt: { lt: expiredQuoteCutoff(now) } },
  });
  return result.count;
}

export async function cleanupExpiredIdempotencyRecords(
  now: Date = new Date()
): Promise<number> {
  const result = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}

export interface LoyaltyArtifactCleanupResult {
  deletedQuotes: number;
  deletedIdempotencyRecords: number;
}

export async function cleanupLoyaltyArtifacts(
  now: Date = new Date()
): Promise<LoyaltyArtifactCleanupResult> {
  const [deletedQuotes, deletedIdempotencyRecords] = await Promise.all([
    cleanupExpiredQuotes(now),
    cleanupExpiredIdempotencyRecords(now),
  ]);
  return { deletedQuotes, deletedIdempotencyRecords };
}
