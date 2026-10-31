import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { ACTIVE_RECALL_SELECT } from '@/lib/counter/recall';

/**
 * Counter table grid: active/ready counts and unpaid total in one response.
 * The generic /api/tables endpoint is shared with the web and intentionally
 * does not pay for these Counter-only aggregates.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'tables', 'read');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const tables = await prisma.table.findMany({
      where: { restaurantId },
      select: {
        id: true,
        tableNumber: true,
        tableName: true,
        status: true,
        orders: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            status: true,
            paymentStatus: true,
            totalAmount: true,
            createdAt: true,
            orderRecalls: ACTIVE_RECALL_SELECT,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ tableNumber: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      tables: tables.map((table) => {
        const activeStatuses = new Set(['PENDING', 'CONFIRMED', 'PREPARING']);
        const activeOrders = table.orders.filter((order) =>
          activeStatuses.has(order.status)
        ).length;
        const readyCount = table.orders.filter(
          (order) => order.status === 'READY' && order.orderRecalls.length === 0
        ).length;
        const recalledCount = table.orders.filter(
          (order) => order.orderRecalls.length > 0
        ).length;
        const pendingCount = table.orders.filter(
          (order) => order.status === 'PENDING'
        ).length;
        const unpaidTotal = table.orders
          .filter((order) => order.paymentStatus === 'PENDING')
          .reduce((sum, order) => sum + Number(order.totalAmount), 0);
        return {
          id: table.id,
          tableNumber: table.tableNumber,
          tableName: table.tableName,
          status: table.status,
          currentOrders: activeOrders,
          pendingCount,
          readyCount,
          recalledCount,
          unpaidTotal: unpaidTotal.toFixed(2),
          lastOrderAt: table.orders[0]?.createdAt?.toISOString() || null,
        };
      }),
    });
  } catch (error) {
    console.error('[CounterTables] Error:', error);
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
      { success: false, error: 'Failed to load Counter tables' },
      { status: 500 }
    );
  }
}
