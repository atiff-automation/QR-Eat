import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  hasPermission as contextHasPermission,
} from '@/lib/tenant-context';
import {
  ORDER_STATUS,
  validateOrderTransition,
  getInvalidTransitionMessage,
} from '@/lib/order-utils';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { recordOrderStatusChanged } from '@/lib/order-events';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { OrderStatus } from '@prisma/client';
import { aggregateTicketStatus } from '@/lib/counter/ticket-status';
import {
  confirmPendingOrder,
  OrderDispatchError,
} from '@/lib/services/order-dispatch-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication using the signed RBAC token (cookie or Bearer).
    const context = await getTenantContext(request);

    if (!context) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { status, estimatedReadyTime } = await request.json();
    const { id: orderId } = await params;

    // Validate status
    const validStatuses = Object.values(ORDER_STATUS);
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid order status' },
        { status: 400 }
      );
    }

    // Get the current order
    const currentOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: true,
      },
    });

    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if user has permission to update this order
    let canUpdateOrder = false;
    const restaurantId = context.restaurantId;

    const isOwnerOrManager =
      context.userType === 'restaurant_owner' ||
      context.isAdmin ||
      (context.userType === 'staff' && context.roleTemplate === 'manager');

    const roleTemplate = context.roleTemplate;
    const isKitchen =
      context.userType === 'staff' && roleTemplate === 'kitchen_staff';
    const isWaiter = context.userType === 'staff' && roleTemplate === 'waiter';

    // D42: kitchen starts/readies; waiter/runner serves; manager/owner can do
    // both. The kitchen must not mark an order SERVED.
    const canServe =
      isOwnerOrManager ||
      isWaiter ||
      contextHasPermission(context, 'orders', 'fulfill');
    const canKitchenAct =
      isOwnerOrManager ||
      isKitchen ||
      contextHasPermission(context, 'orders', 'kitchen') ||
      contextHasPermission(context, 'kitchen', 'write');

    if (context.isAdmin) {
      canUpdateOrder = true;
    } else if (restaurantId && currentOrder.restaurantId === restaurantId) {
      switch (status) {
        case ORDER_STATUS.CONFIRMED:
          canUpdateOrder = isOwnerOrManager;
          break;
        case ORDER_STATUS.PREPARING:
        case ORDER_STATUS.READY:
          canUpdateOrder = canKitchenAct;
          break;
        case ORDER_STATUS.SERVED:
          canUpdateOrder = canServe;
          break;
        case ORDER_STATUS.CANCELLED:
          canUpdateOrder = isOwnerOrManager;
          break;
        default:
          canUpdateOrder = false;
      }
    }

    if (!canUpdateOrder) {
      console.error('❌ Access denied for order status update:', {
        userType: context.userType,
        userRestaurantId: restaurantId,
        orderRestaurantId: currentOrder.restaurantId,
        permissions: context.permissions,
      });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Retries are common when a mobile request times out after the server
    // committed. Treat an already-reached status as an idempotent success
    // instead of reporting an invalid transition.
    if (currentOrder.status === status) {
      let ticket: Record<string, unknown> | undefined;
      if (status === ORDER_STATUS.CONFIRMED) {
        const events = await prisma.orderEvent.findMany({
          where: {
            orderId,
            type: { in: ['order.created', 'order.items.added'] },
          },
          select: { stationId: true, printStatus: true, printedAt: true },
        });
        const aggregate = aggregateTicketStatus(events);
        ticket = {
          routed: events.length > 0,
          stationIds: [...new Set(events.map((event) => event.stationId))],
          unroutedItemIds: [],
          replayed: true,
          ticketStatus: aggregate.aggregate,
        };
      }
      return NextResponse.json({
        success: true,
        order: currentOrder,
        ticket,
        message: `Order already ${status}`,
      });
    }

    // Validate state transition
    if (!validateOrderTransition(currentOrder.status, status)) {
      return NextResponse.json(
        { error: getInvalidTransitionMessage(currentOrder.status, status) },
        { status: 400 }
      );
    }

    // D51: do not silently confirm when no kitchen device is connected. A
    // manager/owner may override with an explicit header; the audit row below
    // records it.
    const stationOverride =
      request.headers.get('x-station-override') === 'true' && isOwnerOrManager;

    // The confirmation path is shared with Counter order entry. The service
    // owns the station guard, optimistic transition, ticket routing,
    // notifications, audit and table refresh so both entry points cannot drift.
    if (status === ORDER_STATUS.CONFIRMED) {
      try {
        const result = await confirmPendingOrder({
          orderId,
          actor: {
            userId: context.userId,
            userType: context.userType,
            isAdmin: context.isAdmin,
          },
          overrideStation: stationOverride,
          estimatedReadyTime,
          ipAddress:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown',
        });
        return NextResponse.json({
          success: true,
          order: result.order,
          ticket: result.ticket,
          message: `Order status updated to ${status}`,
        });
      } catch (error) {
        if (error instanceof OrderDispatchError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: error.statusCode }
          );
        }
        throw error;
      }
    }

    // Prepare update data
    const updateData: {
      status: OrderStatus;
      updatedAt: Date;
      readyAt?: Date;
      servedAt?: Date;
      servedBy?: string;
      estimatedReadyTime?: Date;
      version?: { increment: number };
    } = {
      status: status as OrderStatus,
      updatedAt: new Date(),
      // Status is a state change like any other: bump the optimistic-lock
      // version so a stale POS/kitchen client cannot overwrite it.
      version: { increment: 1 },
    };

    // Set timestamps based on status changes
    switch (status) {
      case ORDER_STATUS.READY:
        if (currentOrder.status === ORDER_STATUS.PREPARING) {
          updateData.readyAt = new Date();
        }
        break;
      case ORDER_STATUS.SERVED:
        if (currentOrder.status === ORDER_STATUS.READY) {
          updateData.servedAt = new Date();
          updateData.servedBy = context.userId;
        }
        break;
    }

    // Add estimated ready time if provided
    if (estimatedReadyTime) {
      updateData.estimatedReadyTime = new Date(estimatedReadyTime);
    }

    // Claim the transition with an optimistic version guard. Two concurrent
    // confirm requests must not both create tickets or both pass this point.
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: currentOrder.status as OrderStatus,
          version: currentOrder.version,
        },
        data: updateData,
      });
      if (claimed.count === 0) return null;
      return tx.order.findUnique({
        where: { id: orderId },
        include: {
          table: {
            select: {
              tableNumber: true,
              tableName: true,
            },
          },
          customerSession: {
            select: {
              customerName: true,
              customerPhone: true,
            },
          },
          items: {
            include: {
              menuItem: {
                select: {
                  name: true,
                  preparationTime: true,
                },
              },
            },
          },
        },
      });
    });

    if (!updatedOrder) {
      const latest = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true, status: true },
      });
      if (latest?.status === status) {
        const events = await prisma.orderEvent.findMany({
          where: {
            orderId,
            type: { in: ['order.created', 'order.items.added'] },
          },
          select: { stationId: true, printStatus: true, printedAt: true },
        });
        const aggregate = aggregateTicketStatus(events);
        return NextResponse.json({
          success: true,
          order: latest,
          ticket: {
            routed: events.length > 0,
            stationIds: [...new Set(events.map((event) => event.stationId))],
            unroutedItemIds: [],
            replayed: true,
            ticketStatus: aggregate.aggregate,
          },
          message: `Order already ${status}`,
        });
      }
      return NextResponse.json(
        {
          error:
            'Order changed while this action was being processed. Reload and try again.',
          code: 'ORDER_CHANGED',
        },
        { status: 409 }
      );
    }

    // Station event log: one event per station that received this order.
    try {
      await recordOrderStatusChanged(orderId, currentOrder.status, status);
    } catch (eventError) {
      console.error(
        `[order-events] FAILED to record status change for ${orderId}:`,
        eventError
      );
    }

    // Log the status change
    await prisma.auditLog.create({
      data: {
        tableName: 'orders',
        recordId: orderId,
        operation: 'UPDATE',
        oldValues: { status: currentOrder.status },
        newValues: { status, ...(stationOverride ? { stationOverride } : {}) },
        changedBy: context.userId,
        ipAddress:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'unknown',
      },
    });

    // Publish PostgreSQL NOTIFY event for real-time updates
    await PostgresEventManager.publishOrderStatusChange({
      orderId,
      oldStatus: currentOrder.status,
      newStatus: status,
      restaurantId: currentOrder.restaurantId,
      tableId: currentOrder.tableId,
      orderNumber: currentOrder.orderNumber,
      timestamp: Date.now(),
      changedBy: context.userId,
    });

    // Send the ready notification; confirmation notifications are owned by
    // the shared dispatch service.
    if (status === ORDER_STATUS.READY) {
      await PostgresEventManager.publishRestaurantNotification({
        type: 'order_ready',
        orderId,
        restaurantId: currentOrder.restaurantId,
        message: `Order ${currentOrder.orderNumber} is ready for pickup`,
        timestamp: Date.now(),
      });
    }

    // Auto-update table status based on order states
    // This is non-blocking and    // Also try to update table status automatically
    try {
      await autoUpdateTableStatus(currentOrder.tableId);
    } catch (error) {
      console.error(
        `[OrderUpdate] Failed to auto-update table status for table ${currentOrder.tableId}:`,
        error
      );
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: `Order status updated to ${status}`,
    });
  } catch (error) {
    console.error('Failed to update order status:', error);
    return NextResponse.json(
      { error: 'Failed to update order status' },
      { status: 500 }
    );
  }
}
