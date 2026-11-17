import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { authenticateDevice } from '@/lib/device-auth';
import { trustedIp } from '@/lib/client-ip';
import { isPrintableEventType } from '@/lib/order-events';
import {
  planPrintAck,
  printAckAction,
  printAuditDescription,
  printAuditValues,
  resolveEffectivePrintMode,
  type TicketPrintState,
} from '@/lib/print/print-ack-service';

interface DeviceSummary {
  id: string;
  name: string;
  lastSeenAt: Date | null;
  lastPrintAt: Date | null;
}

type AckOutcome =
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'retry' }
  | { kind: 'ok'; device: DeviceSummary };

/**
 * POST /api/stations/me/print-ack
 *
 * The station asserts that a specific event/ticket reached paper. `seq` is the
 * order-event id and is optional for backward compatibility with older station
 * builds; without it the ACK can only update device-level lastPrintAt.
 *
 * `phase-b-print-v1` adds the print-authority matrix and an audit row for every
 * event-level ack. A non-authority `skipped` on `COUNTER`/`NONE` is audit-only
 * (C-13) and never changes the ticket state.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateDevice(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const success = body?.success === true;
    // A KDS-only station acknowledges the ticket without printing it. That is
    // a deliberate skip, not a printer failure.
    const skipped = body?.skipped === true && !success;
    const reprint = body?.reprint === true;
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

    // The event write is a compare-and-swap on the observed print state so a
    // concurrent ack cannot downgrade PRINTED or move the first printedAt.
    let outcome: AckOutcome | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await prisma.$transaction(
        async (tx): Promise<AckOutcome> => {
          if (eventId !== null) {
            const event = await tx.orderEvent.findUnique({
              where: { id: eventId },
              select: {
                id: true,
                restaurantId: true,
                orderId: true,
                stationId: true,
                type: true,
                payload: true,
                printStatus: true,
                printAttemptedAt: true,
                printedAt: true,
                printError: true,
                printDeviceId: true,
                station: { select: { settings: true } },
              },
            });

            if (
              !event ||
              event.stationId !== auth.device.stationId ||
              event.restaurantId !== auth.restaurant.id
            ) {
              return { kind: 'not_found' };
            }
            if (!isPrintableEventType(event.type)) {
              return { kind: 'not_found' };
            }

            const printMode = resolveEffectivePrintMode(
              event.payload,
              event.station.settings
            );
            const action = printAckAction(success, skipped);
            const current: TicketPrintState = {
              printStatus: event.printStatus,
              printAttemptedAt: event.printAttemptedAt,
              printedAt: event.printedAt,
              printError: event.printError,
              printDeviceId: event.printDeviceId,
            };

            const plan = planPrintAck({
              source: 'DEVICE',
              printMode,
              action,
              current,
              now,
              error: errorMessage,
              printDeviceId: auth.device.id,
            });

            if (!plan.allowed) {
              // Authority rejection does not touch the event, but the device
              // may still refresh its own presence.
              await tx.device.update({
                where: { id: auth.device.id },
                data: { lastSeenAt: now },
              });
              return { kind: 'forbidden' };
            }

            if (!plan.auditOnly) {
              const claimed = await tx.orderEvent.updateMany({
                where: {
                  id: event.id,
                  printStatus: current.printStatus,
                  printAttemptedAt: current.printAttemptedAt,
                  printedAt: current.printedAt,
                  printError: current.printError,
                  printDeviceId: current.printDeviceId,
                },
                data: plan.next,
              });
              if (claimed.count === 0) {
                return { kind: 'retry' };
              }
            }

            await tx.auditLog.create({
              data: {
                tableName: 'order_events',
                recordId: event.id.toString(),
                operation: 'UPDATE',
                restaurantId: event.restaurantId,
                changedBy: auth.device.id,
                changedByType: 'device',
                category: 'orders',
                description: printAuditDescription(reprint, event.printedAt),
                oldValues: printAuditValues(current),
                newValues: {
                  ...printAuditValues(plan.next),
                  reprint,
                  stationId: event.stationId,
                  eventType: event.type,
                },
                metadata: {
                  orderId: event.orderId,
                  stationId: event.stationId,
                  eventType: event.type,
                  source: 'DEVICE',
                  result: plan.result,
                },
                ipAddress: trustedIp(request),
              },
            });
          }

          const device = await tx.device.update({
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

          return { kind: 'ok', device };
        }
      );

      if (result.kind !== 'retry') {
        outcome = result;
        break;
      }
    }

    if (!outcome) {
      return NextResponse.json(
        { success: false, error: 'Print acknowledgement conflicted; retry' },
        { status: 500 }
      );
    }

    if (outcome.kind === 'not_found') {
      return NextResponse.json(
        {
          success: false,
          error: 'Unknown ticket event for this station',
          code: 'UNKNOWN_TICKET_EVENT',
        },
        { status: 404 }
      );
    }

    if (outcome.kind === 'forbidden') {
      return NextResponse.json(
        {
          success: false,
          error: 'This station is not the print authority for this ticket',
          code: 'PRINT_AUTHORITY_INVALID',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      serverTime: now.toISOString(),
      device: outcome.device,
      print: {
        success,
        skipped,
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
