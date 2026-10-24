import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { authenticateDevice } from '@/lib/device-auth';

/**
 * POST /api/stations/me/print-ack
 *
 * Successful print acknowledgement. The server cannot inspect the Bluetooth
 * printer, so this is the station's assertion that a ticket reached paper.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateDevice(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const success = body?.success === true;
    const now = new Date();

    const device = await prisma.device.update({
      where: { id: auth.device.id },
      data: success
        ? { lastPrintAt: now, lastSeenAt: now }
        : { lastSeenAt: now },
      select: {
        id: true,
        name: true,
        lastSeenAt: true,
        lastPrintAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      serverTime: now.toISOString(),
      device,
      print: {
        success,
        error: typeof body?.error === 'string' ? body.error : undefined,
      },
    });
  } catch (error) {
    console.error('[PrintAck] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Print acknowledgement failed' },
      { status: 500 }
    );
  }
}
