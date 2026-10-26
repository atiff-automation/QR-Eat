import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /api/counter/pending?limit=50&cursor=<orderId>
 *
 * Oldest-first PENDING queue for the Counter app. Unlike the generic orders
 * list, this endpoint exists specifically so older pending orders cannot fall
 * off a fixed 50-row page.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    let restaurantId = context!.restaurantId;
    if (!restaurantId && context!.isAdmin) {
      restaurantId =
        new URL(request.url).searchParams.get('restaurantId') || undefined;
    }

    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const requestedLimit = Number(
      url.searchParams.get('limit') || DEFAULT_LIMIT
    );
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(1, Math.trunc(requestedLimit)), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const cursor = url.searchParams.get('cursor') || undefined;

    const rows = await prisma.order.findMany({
      where: {
        restaurantId,
        status: 'PENDING',
      },
      select: {
        id: true,
        orderNumber: true,
        dailySeq: true,
        tableId: true,
        status: true,
        paymentStatus: true,
        source: true,
        totalAmount: true,
        createdAt: true,
        takenByStaff: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        table: {
          select: {
            tableNumber: true,
            tableName: true,
          },
        },
        items: {
          select: { quantity: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const now = Date.now();

    return NextResponse.json({
      success: true,
      orders: page.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        dailySeq: order.dailySeq,
        tableId: order.tableId,
        tableNumber: order.table.tableNumber,
        tableName: order.table.tableName,
        status: order.status,
        paymentStatus: order.paymentStatus,
        source: order.source,
        takenByName: order.takenByStaff
          ? [order.takenByStaff.firstName, order.takenByStaff.lastName]
              .filter(Boolean)
              .join(' ')
          : null,
        totalAmount: order.totalAmount.toString(),
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        createdAt: order.createdAt.toISOString(),
        ageSeconds: Math.max(
          0,
          Math.floor((now - order.createdAt.getTime()) / 1000)
        ),
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id || null : null,
      serverTime: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error('[CounterPending] Error:', error);
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
      { success: false, error: 'Failed to load pending orders' },
      { status: 500 }
    );
  }
}
