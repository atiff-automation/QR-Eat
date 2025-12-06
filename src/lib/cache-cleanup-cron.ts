/**
 * Cache Cleanup Cron Job
 * Periodically removes expired cache entries from the database
 *
 * @see CLAUDE.md - No Hardcoding, Single Source of Truth
 * @see claudedocs/CODING_STANDARDS.md - Centralized configuration
 * @see claudedocs/DB-CACHE-IMPLEMENTATION-PLAN.md - Phase 3: Integration
 *
 * Purpose: Prevent database bloat from expired cache entries
 * Benefits:
 * - Automatic cleanup without manual intervention
 * - Configurable cleanup interval
 * - Graceful error handling
 * - Production-ready with proper lifecycle management
 *
 * Architecture:
 * - Runs only in server environments (not in browser)
 * - Auto-starts on module import in production
 * - Provides start/stop methods for testing
 * - Uses constants for configuration (no hardcoded values)
 */

import { DBCache } from './db-cache';
import { CACHE_CLEANUP } from './cache-constants';

/**
 * Cache cleanup cron job manager
 * Handles periodic cleanup of expired cache entries
 */
export class CacheCleanupCron {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Start the cleanup cron job
   * Runs cleanup at configured interval
   *
   * @example
   * const cron = new CacheCleanupCron();
   * cron.start();
   */
  start(): void {
    // Prevent multiple starts
    if (this.isRunning || this.intervalId) {
      return;
    }

    // Verify cleanup is enabled
    if (!CACHE_CLEANUP.ENABLED) {
      return;
    }

    this.isRunning = true;

    // Schedule periodic cleanup
    this.intervalId = setInterval(async () => {
      try {
        const deletedCount = await DBCache.clearExpired();

        // Log in development mode only
        if (process.env.NODE_ENV === 'development' && deletedCount > 0) {
          console.log(
            `🧹 Cache cleanup: removed ${deletedCount} expired entries`
          );
        }
      } catch (error) {
        // Fail gracefully - cleanup will retry on next interval
        if (process.env.NODE_ENV === 'development') {
          console.error('Cache cleanup failed:', error);
        }
      }
    }, CACHE_CLEANUP.INTERVAL_MS);

    // Log startup in development
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `🕐 Cache cleanup cron started (interval: ${CACHE_CLEANUP.INTERVAL_MS / 1000}s)`
      );
    }
  }

  /**
   * Stop the cleanup cron job
   * Cleans up resources and stops scheduled cleanup
   *
   * @example
   * const cron = new CacheCleanupCron();
   * cron.start();
   * // Later...
   * cron.stop();
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;

      // Log shutdown in development
      if (process.env.NODE_ENV === 'development') {
        console.log('🛑 Cache cleanup cron stopped');
      }
    }
  }

  /**
   * Check if cron job is running
   *
   * @returns True if cron job is active
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Manually trigger cleanup (for testing or emergency use)
   * Does not affect the scheduled cleanup interval
   *
   * @returns Number of entries deleted
   *
   * @example
   * const cron = new CacheCleanupCron();
   * const deletedCount = await cron.triggerCleanup();
   * console.log(`Manually deleted ${deletedCount} entries`);
   */
  async triggerCleanup(): Promise<number> {
    try {
      return await DBCache.clearExpired();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Manual cache cleanup failed:', error);
      }
      return 0;
    }
  }
}

// ============================================
// GLOBAL SINGLETON INSTANCE
// ============================================

/**
 * Global cache cleanup cron instance
 * Auto-starts in server environments (not in browser or tests)
 */
export const cacheCleanupCron = new CacheCleanupCron();

// Auto-start in production/development server environments
// Do not start in:
// - Browser environments (typeof window !== 'undefined')
// - Test environments (NODE_ENV === 'test')
if (
  typeof window === 'undefined' &&
  process.env.NODE_ENV !== 'test' &&
  CACHE_CLEANUP.ENABLED
) {
  cacheCleanupCron.start();

  // Cleanup on process termination
  const cleanup = () => {
    cacheCleanupCron.stop();
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  process.on('beforeExit', cleanup);
}
