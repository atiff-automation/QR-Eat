/**
 * Scheduled retention for the station event log.
 *
 * `order_events` is append-only and the station stream refuses a cursor older
 * than seven days (410). This job deletes rows past that window so the table
 * does not grow forever. It is deliberately a separate, authenticated endpoint
 * so it can be driven by any scheduler (Railway cron, a systemd timer, curl).
 *
 * GET /api/cron/cleanup-events
 * Authorization: Bearer $CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { cleanupOrderEvents } from '@/lib/order-events';
import { cleanupRestaurantChanges } from '@/lib/restaurant-changes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 7;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 503 }
    );
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const deletedOrderEvents = await cleanupOrderEvents(RETENTION_DAYS);
    const deletedRestaurantChanges =
      await cleanupRestaurantChanges(RETENTION_DAYS);
    console.log(
      `[event-retention] deleted ${deletedOrderEvents} order_events and ` +
        `${deletedRestaurantChanges} restaurant_changes older than ` +
        `${RETENTION_DAYS} days`
    );
    return NextResponse.json({
      deleted: deletedOrderEvents,
      deletedOrderEvents,
      deletedRestaurantChanges,
      retentionDays: RETENTION_DAYS,
    });
  } catch (error) {
    console.error('[event-retention] cleanup failed:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
