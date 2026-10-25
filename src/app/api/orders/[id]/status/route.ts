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
import {
  recordOrderCreated,
  recordOrderStatusChanged,
  type OrderCreatedResult,
} from '@/lib/order-events';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { OrderStatus } from '@prisma/client';
import { COUNTER_STATION_ONLINE_WINDOW_MS } from '@/lib/counter/constants';

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
    if (
      status === ORDER_STATUS.CONFIRMED &&
      currentOrder.status === ORDER_STATUS.PENDING &&
      !stationOverride
    ) {
      const onlineWindow = new Date(
        Date.now() - COUNTER_STATION_ONLINE_WINDOW_MS
      );
      const onlineDevice = await prisma.device.findFirst({
        where: {
          restaurantId: currentOrder.restaurantId,
          isActive: true,
          station: { isActive: true },
          lastSeenAt: { gte: onlineWindow },
        },
        select: { id: true },
      });

      if (!onlineDevice) {
        return NextResponse.json(
          {
            error:
              'Kitchen station is offline. Fix the station or use an explicit manager override.',
            code: 'STATION_OFFLINE',
          },
          { status: 409 }
        );
      }
    }

    // Prepare update data
    const updateData: {
      status: OrderStatus;
      updatedAt: Date;
      confirmedAt?: Date;
      confirmedBy?: string;
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
      case ORDER_STATUS.CONFIRMED:
        if (currentOrder.status === ORDER_STATUS.PENDING) {
          updateData.confirmedAt = new Date();
          updateData.confirmedBy = context.userId;
        }
        break;
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

    // Update the order
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
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

    // D41: the kitchen ticket is created at confirmation, not at QR
    // submission. recordOrderCreated is idempotent, so a retried confirm or an
    // order that predates this flow cannot print twice.
    let ticketResult: OrderCreatedResult | null = null;
    let ticketError: string | null = null;

    if (
      status === ORDER_STATUS.CONFIRMED &&
      currentOrder.status === ORDER_STATUS.PENDING
    ) {
      try {
        ticketResult = await recordOrderCreated(orderId);
      } catch (eventError) {
        ticketError =
          eventError instanceof Error ? eventError.message : 'Ticket failed';
        console.error(
          `[order-events] FAILED to record kitchen ticket for ${orderId} on CONFIRMED:`,
          eventError
        );
      }
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

    // Send kitchen notification for status changes
    if (status === ORDER_STATUS.CONFIRMED) {
      await PostgresEventManager.publishKitchenNotification({
        type: 'new_order',
        orderId,
        restaurantId: currentOrder.restaurantId,
        message: `New order ${currentOrder.orderNumber} ready for kitchen`,
        timestamp: Date.now(),
      });
    } else if (status === ORDER_STATUS.READY) {
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
      ticket:
        status === ORDER_STATUS.CONFIRMED
          ? {
              routed: (ticketResult?.tickets ?? 0) > 0,
              stationIds: ticketResult?.stationIds ?? [],
              unroutedItemIds: ticketResult?.unroutedItemIds ?? [],
              replayed: ticketResult?.replayed ?? false,
              error: ticketError,
            }
          : undefined,
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
