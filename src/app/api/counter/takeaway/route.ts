import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { aggregateTicketStatus } from '@/lib/counter/ticket-status';
import { formatPickupNumber } from '@/lib/order-utils';
import {
  ACTIVE_RECALL_SELECT,
  recallCapability,
  recallFields,
} from '@/lib/counter/recall';

const PRINT_TICKET_TYPES = ['order.created', 'order.items.added'];
const OPEN_STATUSES = ['CONFIRMED', 'PREPARING', 'READY'] as const;
const LIMIT = 100;

/**
 * GET /api/counter/takeaway
 *
 * One read model for the Counter takeaway card and list. It contains every
 * takeaway order that is still actionable: unpaid orders of any status and
 * paid orders that are still being prepared or waiting for pickup. Cancelled
 * orders and paid SERVED orders are excluded.
 *
 * The card counts only orders that can actually take payment. A PENDING order
 * remains visible for confirmation, but it is not payable until it is
 * confirmed.
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

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        orderType: 'TAKEAWAY',
        tableId: null,
        status: { not: 'CANCELLED' },
        OR: [
          { paymentStatus: 'PENDING' },
          { status: { in: [...OPEN_STATUSES] } },
        ],
      },
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
        items: {
          select: {
            quantity: true,
            menuItem: { select: { name: true } },
          },
        },
        orderEvents: {
          where: { type: { in: PRINT_TICKET_TYPES } },
          select: {
            printStatus: true,
            printedAt: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: LIMIT,
    });

    const now = Date.now();
    const rows = orders.map((order) => {
      const ticket = aggregateTicketStatus(order.orderEvents);
      const itemNames = Array.from(
        new Set(
          order.items
            .map((item) => item.menuItem.name.trim())
            .filter((name) => name.length > 0)
        )
      );
      const payable =
        order.paymentStatus === 'PENDING' && order.status !== 'PENDING';

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        dailySeq: order.dailySeq,
        pickupNumber: formatPickupNumber(order.dailySeq),
        orderType: order.orderType,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        tableId: order.tableId,
        tableNumber: null,
        tableName: null,
        status: order.status,
        paymentStatus: order.paymentStatus,
        source: order.source,
        totalAmount: order.totalAmount.toString(),
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        itemNames,
        payable,
        createdAt: order.createdAt.toISOString(),
        readyAt: order.readyAt?.toISOString() ?? null,
        ...recallFields(order.orderRecalls),
        ageSeconds: Math.max(
          0,
          Math.floor((now - order.createdAt.getTime()) / 1000)
        ),
        ticketStatus: ticket.aggregate,
        ticketPrintedAt: ticket.printedAt?.toISOString() ?? null,
      };
    });

    const payableOrders = rows.filter((order) => order.payable);
    const unpaidTotal = payableOrders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0
    );

    return NextResponse.json({
      success: true,
      ...recallCapability(),
      summary: {
        openCount: rows.length,
        unpaidCount: payableOrders.length,
        readyUnpaidCount: payableOrders.filter(
          (order) => order.status === 'READY' && !order.recalled
        ).length,
        recalledCount: rows.filter((order) => order.recalled).length,
        pendingConfirmCount: rows.filter((order) => order.status === 'PENDING')
          .length,
        paidWaitingCount: rows.filter(
          (order) =>
            order.paymentStatus === 'PAID' &&
            (order.status === 'CONFIRMED' || order.status === 'PREPARING')
        ).length,
        unpaidTotal: unpaidTotal.toFixed(2),
      },
      orders: rows,
      serverTime: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error('[CounterTakeaway] Error:', error);
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
      { success: false, error: 'Failed to load takeaway orders' },
      { status: 500 }
    );
  }
}
