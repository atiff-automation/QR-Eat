import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { getTokenFromRequest } from '@/lib/auth-utils';
import { verifyStaffSession } from '@/lib/device-auth';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import {
  recordOrderItemStatusChanged,
  recordOrderRecallCleared,
  recordOrderStatusChanged,
} from '@/lib/order-events';
import {
  clearRecallIfStationReady,
  hasActiveRecallForItem,
} from '@/lib/recall';

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

    let actorId: string | undefined;
    let actorName: string | undefined;
    let userRestaurantId: string | undefined;
    let canKitchen = false;

    const authResult = await AuthServiceV2.validateToken(token);

    if (authResult.isValid && authResult.user) {
      actorId = authResult.user.id;
      actorName =
        `${authResult.user.firstName} ${authResult.user.lastName}`.trim();
      userRestaurantId = authResult.user.currentRole?.restaurantId;
      canKitchen = authResult.user.permissions.some(
        (permission) =>
          permission === 'orders:kitchen' || permission === 'kitchen:write'
      );
    } else {
      const session = verifyStaffSession(token);
      if (!session) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      const staff = await prisma.staff.findUnique({
        where: { id: session.staffId },
        include: { role: { select: { permissions: true } } },
      });

      if (
        !staff ||
        !staff.isActive ||
        staff.restaurantId !== session.restaurantId
      ) {
        return NextResponse.json(
          { error: 'Staff session is not valid for this restaurant' },
          { status: 403 }
        );
      }

      actorId = staff.id;
      actorName = `${staff.firstName} ${staff.lastName}`.trim();
      userRestaurantId = staff.restaurantId;

      const permissions = staff.role.permissions as Record<string, unknown>;
      const kitchen = permissions.kitchen;
      canKitchen = Array.isArray(kitchen) && kitchen.includes('write');
    }

    if (!canKitchen) {
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
            status: true,
            tableId: true,
            orderNumber: true,
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
    if (
      !userRestaurantId ||
      currentItem.order.restaurantId !== userRestaurantId
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // D41: kitchen actions only make sense after manager/owner confirmation.
    // A PENDING order has no kitchen ticket, and a closed order must not be
    // mutated.
    const orderInKitchenState = ['CONFIRMED', 'PREPARING'].includes(
      currentItem.order.status
    );
    if (!orderInKitchenState) {
      // A recalled READY order is the one exception: the kitchen is working it
      // again even though the customer-facing order status is still READY.
      const recalled = await hasActiveRecallForItem(
        currentItem.orderId,
        itemId
      );
      if (!recalled) {
        return NextResponse.json(
          { error: 'Order is not in a kitchen-action state' },
          { status: 409 }
        );
      }
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
            tableId: true,
            orderNumber: true,
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
        status,
        {
          staffId: actorId,
          staffName: actorName,
        }
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

    const orderIdForStatus = orderItem.order.id;
    const restaurantIdForStatus = orderItem.order.restaurantId;
    const tableIdForStatus = orderItem.order.tableId;
    const orderNumberForStatus = orderItem.order.orderNumber;

    // Re-bumping the last recalled item clears the recall without changing the
    // order status. This runs before the normal transition helpers because a
    // recalled order is already READY.
    if (status === 'READY') {
      const recalls = await prisma.stationOrderRecall.findMany({
        where: { orderId: orderIdForStatus, resolvedAt: null },
        select: { stationId: true },
      });

      for (const recall of recalls) {
        const cleared = await clearRecallIfStationReady(
          orderIdForStatus,
          restaurantIdForStatus,
          recall.stationId
        );
        if (!cleared) continue;

        try {
          await recordOrderRecallCleared(
            orderIdForStatus,
            recall.stationId,
            cleared.recalledAt,
            cleared.clearedAt,
            cleared.reason
          );
        } catch (eventError) {
          console.error(
            `[recall] FAILED to record clear event for ${orderIdForStatus}:`,
            eventError
          );
        }

        await PostgresEventManager.publishOrderRecallCleared({
          orderId: orderIdForStatus,
          orderNumber: orderNumberForStatus,
          restaurantId: restaurantIdForStatus,
          stationId: recall.stationId,
          recalledAt: cleared.recalledAt.toISOString(),
          clearedAt: cleared.clearedAt.toISOString(),
          reason: cleared.reason,
          version:
            (
              await prisma.order.findUnique({
                where: { id: orderIdForStatus },
                select: { version: true },
              })
            )?.version ?? 0,
          timestamp: Date.now(),
        });
      }
    }

    const transitionToPreparing = async () => {
      if (orderItem.order.status !== 'CONFIRMED') return;

      const updated = await prisma.order.updateMany({
        where: { id: orderIdForStatus, status: 'CONFIRMED' },
        data: {
          status: 'PREPARING',
          updatedAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) return;

      try {
        await recordOrderStatusChanged(
          orderIdForStatus,
          'CONFIRMED',
          'PREPARING'
        );
      } catch (eventError) {
        console.error(
          `[order-events] FAILED to record PREPARING for ${orderIdForStatus}:`,
          eventError
        );
      }

      await PostgresEventManager.publishOrderStatusChange({
        orderId: orderIdForStatus,
        oldStatus: 'CONFIRMED',
        newStatus: 'PREPARING',
        restaurantId: restaurantIdForStatus,
        tableId: tableIdForStatus,
        orderNumber: orderNumberForStatus,
        timestamp: Date.now(),
      });
    };

    const transitionToReady = async () => {
      const fresh = await prisma.order.findUnique({
        where: { id: orderIdForStatus },
        select: { status: true },
      });

      if (!fresh || !['CONFIRMED', 'PREPARING'].includes(fresh.status)) return;

      const updated = await prisma.order.updateMany({
        where: { id: orderIdForStatus, status: fresh.status },
        data: {
          status: 'READY',
          readyAt: new Date(),
          updatedAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) return;

      try {
        await recordOrderStatusChanged(orderIdForStatus, fresh.status, 'READY');
      } catch (eventError) {
        console.error(
          `[order-events] FAILED to record READY for ${orderIdForStatus}:`,
          eventError
        );
      }

      await PostgresEventManager.publishOrderStatusChange({
        orderId: orderIdForStatus,
        oldStatus: fresh.status,
        newStatus: 'READY',
        restaurantId: restaurantIdForStatus,
        tableId: tableIdForStatus,
        orderNumber: orderNumberForStatus,
        timestamp: Date.now(),
      });
    };

    if (status === 'PREPARING') {
      await transitionToPreparing();
    } else if (status === 'READY') {
      const allOrderItems = await prisma.orderItem.findMany({
        where: { orderId: orderIdForStatus },
      });

      const allItemsReady = allOrderItems.every(
        (item) => item.status === 'READY'
      );

      if (allItemsReady) {
        await transitionToReady();
      } else {
        await transitionToPreparing();
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
