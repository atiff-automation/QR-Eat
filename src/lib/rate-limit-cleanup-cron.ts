/**
 * Rate-limit counter cleanup cron job (P7c, P7b-5).
 *
 * `rate_limit_counters` is an implementation-detail table: a counter is only
 * meaningful inside its fixed hourly window. Rows older than 24 hours are dead
 * weight, so this job prunes them on an interval.
 *
 * Follows `cache-cleanup-cron.ts`:
 * - runs only in a server runtime (not the browser, not tests);
 * - one interval, started once;
 * - idempotent and safe to run repeatedly (a delete of zero rows is a no-op);
 * - errors are swallowed so a cleanup failure never crashes the server or
 *   affects a request. The next interval retries.
 */

import { prisma } from './database';

/** Keep a full day of windows: enough for any hourly limit to be re-checked. */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Hourly is ample for a 24-hour retention window. */
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** The oldest `windowStart` that is still retained. */
export function rateLimitCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RATE_LIMIT_RETENTION_MS);
}

/**
 * Delete every counter whose window started before the retention cutoff.
 * Returns the number of rows removed. Safe to call concurrently: Postgres
 * serialises the deletes and the second sees zero rows.
 */
export async function pruneRateLimitCounters(
  now: Date = new Date()
): Promise<number> {
  const result = await prisma.rateLimitCounter.deleteMany({
    where: { windowStart: { lt: rateLimitCutoff(now) } },
  });
  return result.count;
}

export class RateLimitCleanupCron {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /** Start the cleanup interval. Idempotent. */
  start(): void {
    if (this.isRunning || this.intervalId) return;

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      void this.triggerCleanup();
    }, RATE_LIMIT_CLEANUP_INTERVAL_MS);
  }

  /** Stop the cleanup interval and release the timer. */
  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Run one prune now (also used by tests). Never throws: a database error
   * returns 0 and the next interval retries.
   */
  async triggerCleanup(now: Date = new Date()): Promise<number> {
    try {
      return await pruneRateLimitCounters(now);
    } catch {
      return 0;
    }
  }
}

export const rateLimitCleanupCron = new RateLimitCleanupCron();

// Auto-start in a server runtime. Tests import the module but never start a
// timer, and the browser bundle has no database client.
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  rateLimitCleanupCron.start();

  const cleanup = () => {
    rateLimitCleanupCron.stop();
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  process.on('beforeExit', cleanup);
}
