import { prisma } from '@/lib/database';
import { sendSuccess, sendError } from '@/lib/utils/api-response';

/**
 * Health Check API
 * Verifies system health including database connectivity.
 */
export async function GET() {
  try {
    const startTime = Date.now();

    // 1. Check Database
    await prisma.$queryRaw`SELECT 1`;

    // 2. System Info
    const healthData = {
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'CONNECTED',
      latencyMs: Date.now() - startTime,
      version: process.env.npm_package_version || '1.0.0',
      env: process.env.NODE_ENV,
    };

    return await sendSuccess(healthData);
  } catch (error) {
    console.error('[Health Check] FAILED:', error);

    return await sendError(
      'System health check failed',
      'HEALTH_CHECK_FAILED',
      503,
      {
        database: 'DISCONNECTED',
        timestamp: new Date().toISOString(),
      }
    );
  }
}
