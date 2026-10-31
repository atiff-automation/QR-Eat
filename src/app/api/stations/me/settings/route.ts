/**
 * GET /api/stations/me/settings
 *
 * Device-authenticated station policy. The Station app reads this on connect;
 * the snapshot carries the same object so a cold start has one coherent view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateDevice } from '@/lib/device-auth';
import { normalizeStationSettings } from '@/lib/station-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateDevice(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    return NextResponse.json({
      settings: normalizeStationSettings(auth.station.settings),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[station-settings] failed:', error);
    return NextResponse.json(
      { error: 'Failed to load station settings' },
      { status: 500 }
    );
  }
}
