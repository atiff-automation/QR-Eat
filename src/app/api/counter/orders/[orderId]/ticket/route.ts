import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { aggregateTicketStatus } from '@/lib/counter/ticket-status';

const PRINT_TICKET_TYPES = ['order.created', 'order.items.added'];

/**
 * GET /api/counter/orders/{orderId}/ticket
 *
 * Per-station kitchen ticket delivery/print state for the Counter. Legacy
 * events have printStatus=null and are reported as UNKNOWN, never PRINTED.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');
    await requireOrderAccess(orderId, context!);

    const events = await prisma.orderEvent.findMany({
      where: {
        orderId,
        type: { in: PRINT_TICKET_TYPES },
      },
      select: {
        id: true,
        stationId: true,
        type: true,
        printStatus: true,
        printAttemptedAt: true,
        printedAt: true,
        printError: true,
        station: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
    });

    const aggregate = aggregateTicketStatus(events);
    return NextResponse.json({
      success: true,
      orderId,
      aggregate: aggregate.aggregate,
      printedAt: aggregate.printedAt?.toISOString() ?? null,
      tickets: events.map((event) => ({
        eventId: event.id.toString(),
        stationId: event.stationId,
        stationName: event.station.name,
        type: event.type,
        status: event.printStatus ?? 'UNKNOWN',
        attemptedAt: event.printAttemptedAt?.toISOString() ?? null,
        printedAt: event.printedAt?.toISOString() ?? null,
        error: event.printError,
      })),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CounterTicketStatus] Error:', error);
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
          { success: false, error: error.message },
          { status: 403 }
        );
      }
    }
    return NextResponse.json(
      { success: false, error: 'Failed to load ticket status' },
      { status: 500 }
    );
  }
}
