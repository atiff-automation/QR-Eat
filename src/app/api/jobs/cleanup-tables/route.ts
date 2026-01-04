/**
 * Table Status Cleanup API Endpoint
 *
 * Protected endpoint to trigger daily table status cleanup.
 * Can be called by cron services (Railway Cron, Vercel Cron, etc.) or manually by admins.
 *
 * Authentication: Requires CRON_SECRET environment variable
 *
 * @see src/lib/jobs/cleanup-table-status.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDailyCleanup } from '@/lib/jobs/cleanup-table-status';

/**
 * POST /api/jobs/cleanup-tables
 *
 * Triggers the daily table status cleanup job.
 *
 * Authentication:
 * - Requires 'Authorization: Bearer <CRON_SECRET>' header
 * - CRON_SECRET must be set in environment variables
 *
 * @returns Cleanup results with statistics
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error(
        '[CleanupAPI] CRON_SECRET not configured in environment variables'
      );
      return NextResponse.json(
        {
          error: 'Server configuration error',
          message: 'CRON_SECRET not configured',
        },
        { status: 500 }
      );
    }

    // Check authorization header
    const expectedAuth = `Bearer ${cronSecret}`;
    if (authHeader !== expectedAuth) {
      console.warn('[CleanupAPI] Unauthorized cleanup attempt');
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Invalid or missing authorization token',
        },
        { status: 401 }
      );
    }

    console.log('[CleanupAPI] Starting cleanup job via API...');

    // Run the cleanup
    const startTime = Date.now();
    const results = await runDailyCleanup();
    const duration = Date.now() - startTime;

    console.log(
      `[CleanupAPI] Cleanup completed in ${duration}ms. Tables fixed: ${results.tableCleanup.tablesFixed}, Sessions ended: ${results.expiredSessions}`
    );

    // Return results
    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully',
      duration: `${duration}ms`,
      results: {
        tables: {
          checked: results.tableCleanup.totalTablesChecked,
          fixed: results.tableCleanup.tablesFixed,
          errors: results.tableCleanup.errors.length,
          details: results.tableCleanup.fixedTables,
        },
        sessions: {
          expired: results.expiredSessions,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CleanupAPI] Error running cleanup job:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: 'Cleanup job failed',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/jobs/cleanup-tables
 *
 * Returns information about the cleanup job endpoint.
 * Useful for health checks and documentation.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/jobs/cleanup-tables',
    method: 'POST',
    description: 'Daily table status cleanup job',
    authentication: 'Bearer token required (CRON_SECRET)',
    schedule: 'Recommended: Daily at 3 AM',
    tasks: [
      'Fix tables stuck in occupied status',
      'Clean up expired customer sessions',
    ],
  });
}
