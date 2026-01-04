/**
 * Table Status Cleanup Job
 *
 * Daily maintenance job to ensure table statuses are consistent with order states.
 * This is a safety net to catch edge cases, bugs, or data inconsistencies.
 *
 * Should be run once per day via cron job or similar scheduler.
 *
 * @module lib/jobs/cleanup-table-status
 */

import { prisma } from '@/lib/database';
import { shouldTableBeAvailable } from '@/lib/table-status-manager';
import { PostgresEventManager } from '@/lib/postgres-pubsub';

/**
 * Result of a table status cleanup operation
 */
export interface CleanupResult {
  totalTablesChecked: number;
  tablesFixed: number;
  fixedTables: Array<{
    tableId: string;
    tableNumber: string;
    previousStatus: string;
    newStatus: string;
  }>;
  errors: Array<{
    tableId: string;
    error: string;
  }>;
}

/**
 * Clean up table statuses across all restaurants
 *
 * Finds tables marked as 'occupied' but with no active orders,
 * and marks them as 'available'.
 *
 * @returns Promise resolving to cleanup results
 */
export async function cleanupTableStatuses(): Promise<CleanupResult> {
  const result: CleanupResult = {
    totalTablesChecked: 0,
    tablesFixed: 0,
    fixedTables: [],
    errors: [],
  };

  try {
    console.log('[CleanupJob] Starting table status cleanup...');

    // Find all tables marked as occupied
    const occupiedTables = await prisma.table.findMany({
      where: {
        status: 'occupied',
      },
      select: {
        id: true,
        tableNumber: true,
        status: true,
        restaurantId: true,
      },
    });

    result.totalTablesChecked = occupiedTables.length;
    console.log(
      `[CleanupJob] Found ${occupiedTables.length} occupied tables to check`
    );

    // Check each table
    for (const table of occupiedTables) {
      try {
        const shouldBeAvailable = await shouldTableBeAvailable(table.id);

        if (shouldBeAvailable) {
          // Table should be available but is marked as occupied - fix it
          await prisma.table.update({
            where: { id: table.id },
            data: {
              status: 'available',
              updatedAt: new Date(),
            },
          });

          console.log(
            `[CleanupJob] Fixed table ${table.tableNumber} (${table.id}): occupied → available`
          );

          // Publish real-time update
          await PostgresEventManager.publishTableStatusChange({
            tableId: table.id,
            restaurantId: table.restaurantId,
            previousStatus: 'occupied',
            newStatus: 'available',
            updatedBy: 'cleanup-job',
            timestamp: Date.now(),
          });

          result.tablesFixed++;
          result.fixedTables.push({
            tableId: table.id,
            tableNumber: table.tableNumber,
            previousStatus: 'occupied',
            newStatus: 'available',
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `[CleanupJob] Error checking table ${table.tableNumber} (${table.id}):`,
          error
        );
        result.errors.push({
          tableId: table.id,
          error: errorMessage,
        });
      }
    }

    console.log(
      `[CleanupJob] Cleanup complete. Checked: ${result.totalTablesChecked}, Fixed: ${result.tablesFixed}, Errors: ${result.errors.length}`
    );

    return result;
  } catch (error) {
    console.error('[CleanupJob] Fatal error during cleanup:', error);
    throw error;
  }
}

/**
 * Clean up expired customer sessions
 *
 * Finds active sessions that have expired and marks them as ended.
 * This helps prevent orphaned sessions from accumulating.
 *
 * @returns Promise resolving to number of sessions cleaned up
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    console.log('[CleanupJob] Starting expired session cleanup...');

    const now = new Date();

    // Find expired active sessions
    const expiredSessions = await prisma.customerSession.findMany({
      where: {
        status: 'active',
        expiresAt: {
          lt: now,
        },
      },
      select: {
        id: true,
        tableId: true,
      },
    });

    console.log(
      `[CleanupJob] Found ${expiredSessions.length} expired sessions`
    );

    if (expiredSessions.length === 0) {
      return 0;
    }

    // End all expired sessions
    await prisma.customerSession.updateMany({
      where: {
        id: {
          in: expiredSessions.map((s) => s.id),
        },
      },
      data: {
        status: 'ended',
        endedAt: now,
      },
    });

    console.log(
      `[CleanupJob] Ended ${expiredSessions.length} expired sessions`
    );

    return expiredSessions.length;
  } catch (error) {
    console.error('[CleanupJob] Error cleaning up expired sessions:', error);
    throw error;
  }
}

/**
 * Run all cleanup tasks
 *
 * Executes both table status cleanup and expired session cleanup.
 * This is the main entry point for the daily cleanup job.
 *
 * @returns Promise resolving to combined cleanup results
 */
export async function runDailyCleanup(): Promise<{
  tableCleanup: CleanupResult;
  expiredSessions: number;
}> {
  console.log('[CleanupJob] Starting daily cleanup tasks...');

  const startTime = Date.now();

  // Run both cleanup tasks
  const [tableCleanup, expiredSessions] = await Promise.all([
    cleanupTableStatuses(),
    cleanupExpiredSessions(),
  ]);

  const duration = Date.now() - startTime;

  console.log(
    `[CleanupJob] Daily cleanup completed in ${duration}ms. Tables fixed: ${tableCleanup.tablesFixed}, Sessions ended: ${expiredSessions}`
  );

  return {
    tableCleanup,
    expiredSessions,
  };
}
