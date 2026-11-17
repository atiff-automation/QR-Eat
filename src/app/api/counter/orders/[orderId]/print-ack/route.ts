import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { trustedIp } from '@/lib/client-ip';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { isPrintableEventType } from '@/lib/order-events';
import {
  derivePrintedBy,
  planPrintAck,
  printAckAction,
  printAuditDescription,
  printAuditValues,
  projectPrintStatus,
  resolveEffectivePrintMode,
  type PrintAckPlan,
  type TicketPrintState,
} from '@/lib/print/print-ack-service';
import type { PrintMode } from '@/lib/station-settings';

const EventIdSchema = z
  .union([z.string().trim(), z.number()])
  .transform((value) => (typeof value === 'number' ? String(value) : value))
  .refine((value) => /^[1-9]\d*$/.test(value), {
    message: 'eventId must be a positive integer',
  })
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value), {
    message: 'eventId is out of range',
  });

const PrintAckSchema = z.object({
  eventId: EventIdSchema,
  stationId: z.string().min(1).optional(),
  success: z.boolean(),
  skipped: z.boolean().optional(),
  error: z.string().trim().max(500).nullish(),
  reprint: z.boolean().optional(),
});

/**
 * POST /api/counter/orders/{orderId}/print-ack
 *
 * Staff-authenticated Counter print acknowledgement (`phase-b-print-v1` §7).
 * `eventId` is the idempotency key: repeated acks converge on the §5.2 matrix
 * and never move `printedAt` or create a second ticket. The event update and
 * the audit row are written in one transaction.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    const tenant = requireAuth(context);
    requirePermission(tenant, 'orders', 'write');

    if (!z.string().uuid().safeParse(orderId).success) {
      return NextResponse.json(
        { success: false, error: 'Invalid orderId', code: 'VALIDATION_FAILED' },
        { status: 400 }
      );
    }

    try {
      await requireOrderAccess(orderId, tenant);
    } catch (error) {
      // Cross-tenant staff (403) and a missing order (404) are both 404 here,
      // matching §6.1/§7.1.
      if (
        error instanceof RBACError &&
        (error.statusCode === 403 || error.statusCode === 404)
      ) {
        return NextResponse.json(
          { success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' },
          { status: 404 }
        );
      }
      throw error;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, restaurantId: true },
    });
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' },
        { status: 404 }
      );
    }

    const parsed = PrintAckSchema.safeParse(
      await request.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? 'Invalid request',
          code: 'VALIDATION_FAILED',
        },
        { status: 400 }
      );
    }

    const { eventId, stationId, success, skipped, error, reprint } =
      parsed.data;

    // §7.2 names this specific contradiction `INVALID_ACK`; §7.5 lists the
    // generic `VALIDATION_FAILED` for it. Follow the more specific §7.2 code
    // for this one case and keep VALIDATION_FAILED for other body errors.
    if (success && skipped === true) {
      return NextResponse.json(
        {
          success: false,
          error: 'success and skipped cannot both be true',
          code: 'INVALID_ACK',
        },
        { status: 400 }
      );
    }

    const action = printAckAction(success, skipped === true);
    const now = new Date();

    // `eventId` is the idempotency key. The compare-and-swap below makes two
    // concurrent acks converge instead of letting a stale read downgrade a
    // concurrent PRINTED or move `printedAt`.
    type AckOutcome =
      | { kind: 'not_found' }
      | { kind: 'station_mismatch' }
      | { kind: 'forbidden' }
      | { kind: 'retry' }
      | {
          kind: 'ok';
          eventId: string;
          stationId: string;
          stationName: string;
          eventType: string;
          printedAtBefore: Date | null;
          printMode: PrintMode;
          next: TicketPrintState;
          plan: PrintAckPlan;
        };

    let outcome: AckOutcome | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await prisma.$transaction(
        async (tx): Promise<AckOutcome> => {
          const event = await tx.orderEvent.findUnique({
            where: { id: BigInt(eventId) },
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
              station: { select: { name: true, settings: true } },
            },
          });

          // The event must belong to this order and this restaurant; a
          // mismatch is 404, not a silent no-op (§7.1).
          if (
            !event ||
            event.orderId !== orderId ||
            event.restaurantId !== order.restaurantId ||
            !isPrintableEventType(event.type)
          ) {
            return { kind: 'not_found' };
          }

          if (stationId !== undefined && stationId !== event.stationId) {
            return { kind: 'station_mismatch' };
          }

          const printMode = resolveEffectivePrintMode(
            event.payload,
            event.station.settings
          );
          const current: TicketPrintState = {
            printStatus: event.printStatus,
            printAttemptedAt: event.printAttemptedAt,
            printedAt: event.printedAt,
            printError: event.printError,
            printDeviceId: event.printDeviceId,
          };
          const plan = planPrintAck({
            source: 'COUNTER',
            printMode,
            action,
            current,
            now,
            error: error ?? null,
            printDeviceId: null,
          });

          if (!plan.allowed) {
            return { kind: 'forbidden' };
          }

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

          await tx.auditLog.create({
            data: {
              tableName: 'order_events',
              recordId: event.id.toString(),
              operation: 'UPDATE',
              restaurantId: event.restaurantId,
              changedBy: tenant.userId,
              changedByType:
                tenant.userType === 'restaurant_owner'
                  ? 'restaurant_owner'
                  : 'staff',
              category: 'orders',
              description: printAuditDescription(
                reprint === true,
                event.printedAt
              ),
              oldValues: printAuditValues(current),
              newValues: {
                ...printAuditValues(plan.next),
                reprint: reprint === true,
                stationId: event.stationId,
                eventType: event.type,
              },
              metadata: {
                orderId: event.orderId,
                stationId: event.stationId,
                eventType: event.type,
                source: 'COUNTER',
                result: plan.result,
              },
              ipAddress: trustedIp(request),
            },
          });

          return {
            kind: 'ok',
            eventId: event.id.toString(),
            stationId: event.stationId,
            stationName: event.station.name,
            eventType: event.type,
            printedAtBefore: event.printedAt,
            printMode,
            next: plan.next,
            plan,
          };
        }
      );

      if (result.kind !== 'retry') {
        outcome = result;
        break;
      }
    }

    if (!outcome) {
      return NextResponse.json(
        {
          success: false,
          error: 'Print acknowledgement conflicted; retry',
          code: 'PRINT_ACK_CONFLICT',
        },
        { status: 500 }
      );
    }

    if (outcome.kind === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Ticket not found', code: 'TICKET_NOT_FOUND' },
        { status: 404 }
      );
    }
    if (outcome.kind === 'station_mismatch') {
      return NextResponse.json(
        {
          success: false,
          error: 'stationId does not match the ticket station',
          code: 'STATION_MISMATCH',
        },
        { status: 409 }
      );
    }
    if (outcome.kind === 'forbidden') {
      return NextResponse.json(
        {
          success: false,
          error: 'The ticket is not under Counter print authority',
          code: 'PRINT_AUTHORITY_INVALID',
        },
        { status: 409 }
      );
    }

    const {
      eventId: ackedEventId,
      stationId: ackedStationId,
      stationName,
      eventType,
      printedAtBefore,
      printMode,
      next,
      plan,
    } = outcome;

    return NextResponse.json({
      success: true,
      orderId,
      ticket: {
        eventId: ackedEventId,
        stationId: ackedStationId,
        stationName,
        printMode,
        type: eventType,
        printStatus: projectPrintStatus(next.printStatus),
        printAttemptedAt: next.printAttemptedAt?.toISOString() ?? null,
        printedAt: next.printedAt?.toISOString() ?? null,
        printError: next.printError,
        printedBy: derivePrintedBy(next),
        canAck: printMode === 'COUNTER',
      },
      reprint: reprint === true && printedAtBefore !== null,
      // §5.2 rule 4 / §7.3: a printed ticket is never downgraded and the
      // response reports `downgraded:false`; the audit row carries the
      // NO_DOWNGRADE outcome instead.
      downgraded: false,
      replayed: plan.replayed,
      serverTime: now.toISOString(),
    });
  } catch (error) {
    console.error('[CounterPrintAck] Error:', error);
    if (error instanceof RBACError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            code: 'PERMISSION_DENIED',
          },
          { status: 403 }
        );
      }
    }
    return NextResponse.json(
      { success: false, error: 'Print acknowledgement failed' },
      { status: 500 }
    );
  }
}
