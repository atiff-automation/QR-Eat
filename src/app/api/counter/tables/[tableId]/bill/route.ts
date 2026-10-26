import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { ORDER_WITH_DETAILS_INCLUDE } from '@/lib/order-utils';

/**
 * GET /api/counter/tables/{tableId}/bill
 *
 * Canonical counter bill. Includes unpaid, non-cancelled orders (including
 * PENDING, marked not payable), paid total and server labels.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;

    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');
    await requireTableAccess(tableId, context!);

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: {
        id: true,
        tableNumber: true,
        tableName: true,
        status: true,
        restaurantId: true,
        restaurant: {
          select: {
            currency: true,
            taxLabel: true,
            serviceChargeLabel: true,
          },
        },
      },
    });

    if (!table) {
      return NextResponse.json(
        { success: false, error: 'Table not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // A table is reused across sittings. Unpaid orders must match exactly what
    // the payment service will charge, including multiple active QR sessions at
    // the same table. Paid totals are scoped only to the sessions that own those
    // unpaid orders, so historical sittings never appear as "already paid".
    const orders = await prisma.order.findMany({
      where: {
        tableId,
        restaurantId: table.restaurantId,
        paymentStatus: 'PENDING',
        status: { not: 'CANCELLED' },
      },
      include: ORDER_WITH_DETAILS_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    const billSessionIds = Array.from(
      new Set(
        orders
          .map((order) => order.customerSessionId)
          .filter((id): id is string => Boolean(id))
      )
    );
    const paid = billSessionIds.length
      ? await prisma.order.aggregate({
          where: {
            tableId,
            restaurantId: table.restaurantId,
            paymentStatus: 'PAID',
            status: { not: 'CANCELLED' },
            customerSessionId: { in: billSessionIds },
          },
          _sum: { totalAmount: true },
        })
      : { _sum: { totalAmount: null } };

    const unpaidTotal = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0
    );
    const subtotalAmount = orders.reduce(
      (sum, order) => sum + Number(order.subtotalAmount),
      0
    );
    const taxAmount = orders.reduce(
      (sum, order) => sum + Number(order.taxAmount),
      0
    );
    const serviceCharge = orders.reduce(
      (sum, order) => sum + Number(order.serviceCharge),
      0
    );
    const paidTotal = Number(paid._sum.totalAmount || 0);
    const pendingCount = orders.filter(
      (order) => order.status === 'PENDING'
    ).length;

    // Exactly the orders that would block the explicit Counter table clear.
    // Paid orders that have not been served still block: payment is not the
    // same thing as service. The payment-success screen uses this to avoid
    // offering an action that must fail.
    const blockingOrderCount = await prisma.order.count({
      where: {
        tableId,
        restaurantId: table.restaurantId,
        OR: [
          { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
          { status: 'SERVED', paymentStatus: 'PENDING' },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        tableName: table.tableName,
        status: table.status,
      },
      currency: table.restaurant.currency,
      taxLabel: table.restaurant.taxLabel || 'Tax',
      serviceChargeLabel:
        table.restaurant.serviceChargeLabel || 'Service Charge',
      orders: orders.map((order) => ({
        ...order,
        payable: order.status !== 'PENDING',
        isPending: order.status === 'PENDING',
      })),
      unpaidTotal,
      subtotalAmount,
      taxAmount,
      serviceCharge,
      paidTotal,
      pendingCount,
      blockingOrderCount,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CounterBill] Error:', error);

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
      { success: false, error: 'Failed to load table bill' },
      { status: 500 }
    );
  }
}
