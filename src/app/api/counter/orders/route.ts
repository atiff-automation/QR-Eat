import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { aggregateTicketStatus } from '@/lib/counter/ticket-status';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { formatPickupNumber } from '@/lib/order-utils';
import {
  ACTIVE_RECALL_SELECT,
  recallCapability,
  recallFields,
} from '@/lib/counter/recall';
import {
  CounterOrderError,
  CounterOrderInputSchema,
  createCounterOrder,
} from '@/lib/services/counter-order-service';
import type { OrderStatus } from '@prisma/client';

const ACTIVE_STATUSES: OrderStatus[] = ['CONFIRMED', 'PREPARING'];
const READY_STATUSES: OrderStatus[] = ['READY'];

/**
 * POST /api/counter/orders
 *
 * Staff-entered Counter order. The server prices the order from the menu,
 * writes it as pending, then immediately uses the shared confirmation/dispatch
 * path when the kitchen is available. If the kitchen is offline the order is
 * returned as PENDING with a warning instead of being lost.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'write');

    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Idempotency-Key header is required',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        },
        { status: 400 }
      );
    }

    const input = CounterOrderInputSchema.parse(await request.json());
    if (input.orderType === 'DINE_IN') {
      await requireTableAccess(input.tableId!, context!);
    }

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const isOwnerOrManager =
      context!.userType === 'restaurant_owner' ||
      (context!.userType === 'staff' && context!.roleTemplate === 'manager');
    const overrideStation =
      request.headers.get('x-station-override') === 'true' && isOwnerOrManager;

    const result = await createCounterOrder(
      input,
      {
        userId: context!.userId,
        userType: context!.userType,
        isAdmin: context!.isAdmin,
        restaurantId,
      },
      idempotencyKey,
      {
        overrideStation,
        ipAddress:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'unknown',
      }
    );

    return NextResponse.json(
      { success: true, ...result },
      { status: result.replayed ? 200 : 201 }
    );
  } catch (error) {
    console.error('[CounterOrderCreate] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid order data',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    if (error instanceof CounterOrderError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          issues: error.issues,
        },
        { status: error.statusCode }
      );
    }
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
      { success: false, error: 'Failed to create the Counter order' },
      { status: 500 }
    );
  }
}

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
        dailySeq: true,
        orderType: true,
        customerName: true,
        customerPhone: true,
        tableId: true,
        status: true,
        paymentStatus: true,
        source: true,
        totalAmount: true,
        createdAt: true,
        readyAt: true,
        orderRecalls: ACTIVE_RECALL_SELECT,
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
      ...recallCapability(),
      orders: orders.map((order) => {
        const ticket = aggregateTicketStatus(order.orderEvents);
        const ageFrom =
          scope === 'ready' && order.readyAt ? order.readyAt : order.createdAt;
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          dailySeq: order.dailySeq,
          orderType: order.orderType,
          pickupNumber: formatPickupNumber(order.dailySeq),
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          tableId: order.tableId,
          tableNumber: order.table?.tableNumber ?? null,
          tableName: order.table?.tableName ?? null,
          status: order.status,
          paymentStatus: order.paymentStatus,
          source: order.source,
          totalAmount: order.totalAmount.toString(),
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          createdAt: order.createdAt.toISOString(),
          readyAt: order.readyAt?.toISOString() ?? null,
          ...recallFields(order.orderRecalls),
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
