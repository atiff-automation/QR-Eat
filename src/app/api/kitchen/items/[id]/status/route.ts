import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { getTokenFromRequest } from '@/lib/auth-utils';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import {
  recordOrderItemStatusChanged,
  recordOrderStatusChanged,
} from '@/lib/order-events';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication using RBAC system
    // Supports both cookie auth (web) and ?token= query param (mobile)
    const token = getTokenFromRequest(request);

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user has kitchen permissions
    if (!authResult.user.permissions.includes('orders:kitchen')) {
      return NextResponse.json(
        { error: 'Kitchen access required' },
        { status: 403 }
      );
    }

    const { id: itemId } = await params;
    const { status } = await request.json();

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ['PENDING', 'PREPARING', 'READY'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Get current item status before update
    const currentItem = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: {
        status: true,
        orderId: true,
        order: {
          select: {
            restaurantId: true,
          },
        },
      },
    });

    if (!currentItem) {
      return NextResponse.json(
        { error: 'Order item not found' },
        { status: 404 }
      );
    }

    // Check ownership before mutating. The old code updated the row first and
    // rejected afterwards, which let a kitchen user from another restaurant
    // change the item before the 403.
    const userRestaurantId = authResult.user.currentRole?.restaurantId;
    if (
      !userRestaurantId ||
      currentItem.order.restaurantId !== userRestaurantId
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update the order item status
    const orderItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        status,
        updatedAt: new Date(),
      },
      include: {
        order: {
          select: {
            id: true,
            restaurantId: true,
            status: true,
          },
        },
      },
    });

    // Station event log: item-level progress for the kitchen display. A
    // failure here is loud, but it must not reject a status the user already
    // changed; the snapshot reconciles on the next resync.
    try {
      await recordOrderItemStatusChanged(
        orderItem.order.id,
        itemId,
        currentItem.status,
        status
      );
    } catch (eventError) {
      console.error(
        `[order-events] FAILED to record item status for ${itemId}:`,
        eventError
      );
    }

    // Publish PostgreSQL NOTIFY event for item status change
    await PostgresEventManager.publishOrderItemStatusChange({
      orderId: orderItem.order.id,
      itemId: itemId,
      restaurantId: orderItem.order.restaurantId,
      oldStatus: currentItem.status,
      newStatus: status,
      timestamp: Date.now(),
    });

    // Check if all items in the order are ready, then update order status
    if (status === 'READY') {
      const allOrderItems = await prisma.orderItem.findMany({
        where: { orderId: orderItem.order.id },
      });

      const allItemsReady = allOrderItems.every(
        (item) => item.status === 'READY'
      );

      if (
        allItemsReady &&
        ['CONFIRMED', 'PREPARING'].includes(orderItem.order.status)
      ) {
        const fromStatus = orderItem.order.status;

        await prisma.order.update({
          where: { id: orderItem.order.id },
          data: {
            status: 'READY',
            readyAt: new Date(),
            updatedAt: new Date(),
            version: { increment: 1 },
          },
        });

        // Station event log: the order-level READY transition is what a
        // station console shows; item events alone do not move the ticket.
        try {
          await recordOrderStatusChanged(
            orderItem.order.id,
            fromStatus,
            'READY'
          );
        } catch (eventError) {
          console.error(
            `[order-events] FAILED to record READY for ${orderItem.order.id}:`,
            eventError
          );
        }

        // Publish order status change event
        await PostgresEventManager.publishOrderStatusChange({
          orderId: orderItem.order.id,
          oldStatus: fromStatus,
          newStatus: 'READY',
          restaurantId: orderItem.order.restaurantId,
          tableId: '', // Not available in this context
          orderNumber: '', // Not available in this context
          timestamp: Date.now(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      orderItem,
    });
  } catch (error) {
    console.error('Failed to update order item status:', error);
    return NextResponse.json(
      { error: 'Failed to update item status' },
      { status: 500 }
    );
  }
}
