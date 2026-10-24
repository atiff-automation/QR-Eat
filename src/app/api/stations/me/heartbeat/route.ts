import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { authenticateDevice } from '@/lib/device-auth';

/**
 * POST /api/stations/me/heartbeat
 *
 * Device-authenticated heartbeat. Keeps lastSeenAt fresh even when the
 * station is only holding an SSE connection.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateDevice(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const appVersion =
      typeof body?.appVersion === 'string' ? body.appVersion : undefined;
    const now = new Date();

    const device = await prisma.device.update({
      where: { id: auth.device.id },
      data: {
        lastSeenAt: now,
        ...(appVersion ? { appVersion } : {}),
      },
      select: {
        id: true,
        name: true,
        lastSeenAt: true,
        appVersion: true,
      },
    });

    return NextResponse.json({
      success: true,
      serverTime: now.toISOString(),
      device,
      station: {
        id: auth.station.id,
        name: auth.station.name,
      },
    });
  } catch (error) {
    console.error('[Heartbeat] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Heartbeat failed' },
      { status: 500 }
    );
  }
}
