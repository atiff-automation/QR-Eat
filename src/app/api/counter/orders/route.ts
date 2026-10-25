import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { aggregateTicketStatus } from '@/lib/counter/ticket-status';
import type { OrderStatus } from '@prisma/client';

const ACTIVE_STATUSES: OrderStatus[] = ['CONFIRMED', 'PREPARING'];
const READY_STATUSES: OrderStatus[] = ['READY'];

/**
 * GET /api/counter/orders?scope=active|ready
 *
 * Counter order list with the per-order kitchen ticket aggregate. The generic
 * web order list remains unchanged; this endpoint is the Counter's source for
 * queued/printed/failed badges.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const scope =
      url.searchParams.get('scope') === 'ready' ? 'ready' : 'active';
    const requestedLimit = Number(url.searchParams.get('limit') || 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(1, Math.trunc(requestedLimit)), 100)
      : 100;
    const statuses = scope === 'ready' ? READY_STATUSES : ACTIVE_STATUSES;

    const orders = await prisma.order.findMany({
      where: { restaurantId, status: { in: statuses } },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        createdAt: true,
        readyAt: true,
        table: { select: { tableNumber: true, tableName: true } },
        items: { select: { quantity: true } },
        orderEvents: {
          where: { type: { in: ['order.created', 'order.items.added'] } },
          select: {
            printStatus: true,
            printedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const now = Date.now();
    return NextResponse.json({
      success: true,
      scope,
      orders: orders.map((order) => {
        const ticket = aggregateTicketStatus(order.orderEvents);
        const ageFrom =
          scope === 'ready' && order.readyAt ? order.readyAt : order.createdAt;
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          tableNumber: order.table.tableNumber,
          tableName: order.table.tableName,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount.toString(),
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          createdAt: order.createdAt.toISOString(),
          readyAt: order.readyAt?.toISOString() ?? null,
          ageSeconds: Math.max(0, Math.floor((now - ageFrom.getTime()) / 1000)),
          ticketStatus: ticket.aggregate,
          ticketPrintedAt: ticket.printedAt?.toISOString() ?? null,
        };
      }),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CounterOrders] Error:', error);
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
      { success: false, error: 'Failed to load Counter orders' },
      { status: 500 }
    );
  }
}
