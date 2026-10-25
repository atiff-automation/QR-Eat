import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { authenticateDevice } from '@/lib/device-auth';

const PRINT_EVENT_TYPES = new Set([
  'order.created',
  'order.items.added',
  'order.cancelled',
]);

/**
 * POST /api/stations/me/print-ack
 *
 * The station asserts that a specific event/ticket reached paper. `seq` is the
 * order-event id and is optional for backward compatibility with older station
 * builds; without it the ACK can only update device-level lastPrintAt.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateDevice(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const success = body?.success === true;
    const errorMessage =
      typeof body?.error === 'string' ? body.error.slice(0, 500) : null;
    const now = new Date();

    let eventId: bigint | null = null;
    if (body?.seq !== undefined && body?.seq !== null) {
      const raw = Number(body.seq);
      if (!Number.isSafeInteger(raw) || raw <= 0) {
        return NextResponse.json(
          { success: false, error: 'seq must be a positive integer' },
          { status: 400 }
        );
      }
      eventId = BigInt(raw);
    }

    const device = await prisma.$transaction(async (tx) => {
      if (eventId !== null) {
        const event = await tx.orderEvent.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            stationId: true,
            type: true,
            printStatus: true,
            printedAt: true,
          },
        });

        if (!event || event.stationId !== auth.device.stationId) {
          return { error: 'Unknown ticket event for this station' as const };
        }
        if (!PRINT_EVENT_TYPES.has(event.type)) {
          return { error: 'Event is not a printable ticket' as const };
        }

        if (success) {
          await tx.orderEvent.update({
            where: { id: event.id },
            data: {
              printStatus: 'PRINTED',
              printAttemptedAt: now,
              printedAt: event.printedAt ?? now,
              printError: null,
              printDeviceId: auth.device.id,
            },
          });
        } else if (event.printedAt === null) {
          // A retry may follow a failure. Do not downgrade an already printed
          // ticket because a later reprint attempt failed.
          await tx.orderEvent.update({
            where: { id: event.id },
            data: {
              printStatus: 'FAILED',
              printAttemptedAt: now,
              printError: errorMessage || 'Printer failed',
              printDeviceId: auth.device.id,
            },
          });
        } else {
          await tx.orderEvent.update({
            where: { id: event.id },
            data: {
              printAttemptedAt: now,
              printError: errorMessage || 'Reprint failed',
              printDeviceId: auth.device.id,
            },
          });
        }
      }

      return await tx.device.update({
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
    });

    if ('error' in device) {
      return NextResponse.json(
        { success: false, error: device.error, code: 'UNKNOWN_TICKET_EVENT' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      serverTime: now.toISOString(),
      device,
      print: {
        success,
        seq: eventId?.toString() ?? null,
        error: errorMessage ?? undefined,
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
