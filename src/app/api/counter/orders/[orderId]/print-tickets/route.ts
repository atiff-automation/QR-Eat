import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  PRINTABLE_EVENT_TYPES,
  isPrintableEventType,
} from '@/lib/order-events';
import {
  canAck,
  derivePrintedBy,
  projectPrintStatus,
  resolveEffectivePrintMode,
} from '@/lib/print/print-ack-service';

/**
 * GET /api/counter/orders/{orderId}/print-tickets
 *
 * Staff-authenticated, tenant-scoped ticket payloads for the Counter's local
 * print queue (`phase-b-print-v1` §6). Read-only: no ack, no event creation.
 * Only printable events are returned; an empty list is a valid 200.
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
    const tenant = requireAuth(context);
    requirePermission(tenant, 'orders', 'read');

    if (!z.string().uuid().safeParse(orderId).success) {
      return NextResponse.json(
        { success: false, error: 'Invalid orderId', code: 'VALIDATION_FAILED' },
        { status: 400 }
      );
    }

    try {
      await requireOrderAccess(orderId, tenant);
    } catch (error) {
      // The shared helper throws 403 for a cross-tenant staff user and 404 for
      // a missing order. These routes expose 404 for both so a tenant cannot
      // probe another's order ids (§6.1).
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

    const events = await prisma.orderEvent.findMany({
      where: {
        orderId,
        type: { in: [...PRINTABLE_EVENT_TYPES] },
        ...(tenant.restaurantId ? { restaurantId: tenant.restaurantId } : {}),
      },
      select: {
        id: true,
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
      orderBy: { id: 'asc' },
    });

    const tickets = events
      .filter((event) => isPrintableEventType(event.type))
      .map((event) => {
        const printMode = resolveEffectivePrintMode(
          event.payload,
          event.station.settings
        );
        return {
          eventId: event.id.toString(),
          orderId: event.orderId,
          stationId: event.stationId,
          stationName: event.station.name,
          printMode,
          type: event.type,
          // Verbatim server-authored document; the Counter must not rebuild it.
          payload: event.payload,
          printStatus: projectPrintStatus(event.printStatus),
          printAttemptedAt: event.printAttemptedAt?.toISOString() ?? null,
          printedAt: event.printedAt?.toISOString() ?? null,
          printError: event.printError,
          printedBy: derivePrintedBy(event),
          canAck: canAck(printMode),
        };
      });

    return NextResponse.json({
      success: true,
      orderId,
      serverTime: new Date().toISOString(),
      tickets,
    });
  } catch (error) {
    console.error('[CounterPrintTickets] Error:', error);
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
      { success: false, error: 'Failed to load print tickets' },
      { status: 500 }
    );
  }
}
