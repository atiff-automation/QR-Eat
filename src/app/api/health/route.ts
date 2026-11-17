import type { NextRequest } from 'next/server';
import { resolveClientIp } from '@/lib/client-ip';
import { sendSuccess, sendError } from '@/lib/utils/api-response';

/**
 * Health Check API
 * Verifies system health including database connectivity.
 *
 * CRITICAL: This endpoint must respond quickly to pass Railway's health check.
 * We check environment variables first, then attempt database connection.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = resolveClientIp(request);
  // Source and entry count only: an address is personal data and must never be
  // returned. The pilot runbook reads this instead of a log line. Every payload
  // below carries it, including the degraded and unexpected-error responses.
  const edgeIp = {
    source: clientIp.source,
    xffEntries: clientIp.xffEntries,
  };

  try {
    // 1. Check critical environment variables FIRST
    const envCheck = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      NODE_ENV: process.env.NODE_ENV || 'unknown',
      JWT_SECRET: !!process.env.JWT_SECRET,
    };

    console.log('[Health Check] Environment variables check:', envCheck);

    // If DATABASE_URL is missing, return degraded health immediately
    if (!process.env.DATABASE_URL) {
      console.error(
        '[Health Check] CRITICAL: DATABASE_URL environment variable is not set!'
      );
      return await sendError(
        'DATABASE_URL environment variable is not configured',
        'ENV_VAR_MISSING',
        503,
        {
          status: 'DEGRADED',
          database: 'NOT_CONFIGURED',
          envCheck,
          edgeIp,
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        }
      );
    }

    // 2. Try database connection (lazy import to avoid module-level issues)
    let databaseStatus = 'UNKNOWN';
    let dbError = null;

    try {
      // Lazy import prisma to avoid initialization issues
      const { prisma } = await import('@/lib/database');

      // Set a timeout for database query
      const dbCheckPromise = prisma.$queryRaw`SELECT 1`;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Database query timeout')),
          5000
        );
      });

      try {
        await Promise.race([dbCheckPromise, timeoutPromise]);
        databaseStatus = 'CONNECTED';
      } finally {
        // Clear the timer on every path so a fast query does not leave a
        // pending 5 s timer behind.
        clearTimeout(timeoutId);
      }
    } catch (error) {
      dbError =
        error instanceof Error ? error.message : 'Unknown database error';
      databaseStatus = 'DISCONNECTED';
      console.error('[Health Check] Database connection failed:', dbError);
    }

    // 3. Build health response
    const healthData = {
      status: databaseStatus === 'CONNECTED' ? 'UP' : 'DEGRADED',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: databaseStatus,
      latencyMs: Date.now() - startTime,
      version: process.env.npm_package_version || '1.0.0',
      env: process.env.NODE_ENV,
      envCheck,
      edgeIp,
    };

    // If database is down, return 503 but with detailed info
    if (databaseStatus !== 'CONNECTED') {
      return await sendError(
        'Database connection failed',
        'DATABASE_UNAVAILABLE',
        503,
        {
          ...healthData,
          dbError,
        }
      );
    }

    // All checks passed
    return await sendSuccess(healthData);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('[Health Check] FAILED with unexpected error:', error);

    return await sendError(
      'System health check failed',
      'HEALTH_CHECK_FAILED',
      503,
      {
        status: 'DOWN',
        database: 'UNKNOWN',
        edgeIp,
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
        error: errorMessage,
        env: process.env.NODE_ENV,
      }
    );
  }
}
