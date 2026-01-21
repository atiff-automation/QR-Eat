import { prisma } from '../database';

/**
 * Materialized View Refresh Utilities
 * Manages the expense_daily_summary materialized view
 */

/**
 * Refresh the expense_daily_summary materialized view
 * Call this after bulk expense operations or on a schedule
 */
export async function refreshExpenseSummaryView(): Promise<void> {
  try {
    await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY expense_daily_summary`;
    console.log('[DB] Refreshed expense_daily_summary materialized view');
  } catch (error) {
    console.error('[DB] Error refreshing materialized view:', error);
    throw error;
  }
}

/**
 * Check when the materialized view was last refreshed
 */
export async function getViewLastRefreshTime(): Promise<Date | null> {
  try {
    const result = await prisma.$queryRaw<Array<{ last_refresh: Date }>>`
      SELECT 
        pg_stat_get_last_vacuum_time(c.oid) as last_refresh
      FROM pg_class c
      WHERE c.relname = 'expense_daily_summary'
    `;

    return result[0]?.last_refresh || null;
  } catch (error) {
    console.error('[DB] Error getting view refresh time:', error);
    return null;
  }
}

/**
 * Schedule automatic refresh of materialized view
 * Run this in production to keep view up-to-date
 */
export function scheduleViewRefresh(): void {
  if (process.env.NODE_ENV === 'production') {
    // Refresh every 15 minutes
    setInterval(
      async () => {
        try {
          await refreshExpenseSummaryView();
        } catch (error) {
          console.error('[DB] Scheduled view refresh failed:', error);
        }
      },
      15 * 60 * 1000
    );

    console.log('[DB] Scheduled materialized view refresh every 15 minutes');
  }
}
