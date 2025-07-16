import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/order-utils';
import { RedisEventManager } from '@/lib/redis';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { status, estimatedReadyTime } = await request.json();
    const orderId = params.id;

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
    let hasPermission = false;

    if (authResult.user.type === 'platform_admin') {
      hasPermission = true;
    } else if (authResult.user.type === 'staff') {
      // For staff, check both possible restaurant ID locations
      hasPermission =
        currentOrder.restaurantId === authResult.user.restaurantId ||
        currentOrder.restaurantId === authResult.user.user?.restaurantId;
    } else if (authResult.user.type === 'restaurant_owner') {
      // Check if the restaurant belongs to this owner
      hasPermission =
        currentOrder.restaurant.ownerId === authResult.user.user.id;
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Prepare update data
    const updateData: {
      status: string;
      updatedAt: Date;
      confirmedAt?: Date;
      confirmedBy?: string;
      readyAt?: Date;
      servedAt?: Date;
      servedBy?: string;
      estimatedReadyTime?: Date;
    } = {
      status,
      updatedAt: new Date(),
    };

    // Set timestamps based on status changes
    switch (status) {
      case ORDER_STATUS.CONFIRMED:
        if (currentOrder.status === ORDER_STATUS.PENDING) {
          updateData.confirmedAt = new Date();
          updateData.confirmedBy =
            authResult.user.type === 'staff'
              ? authResult.user.id || authResult.user.user.id
              : authResult.user.user.id;
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
          updateData.servedBy =
            authResult.user.type === 'staff'
              ? authResult.user.id || authResult.user.user.id
              : authResult.user.user.id;
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

    // Log the status change
    await prisma.auditLog.create({
      data: {
        tableName: 'orders',
        recordId: orderId,
        operation: 'UPDATE',
        oldValues: { status: currentOrder.status },
        newValues: { status },
        changedBy:
          authResult.user.type === 'staff'
            ? authResult.user.id || authResult.user.user.id
            : authResult.user.user.id,
        ipAddress:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'unknown',
      },
    });

    // Publish Redis event for real-time updates
    await RedisEventManager.publishOrderStatusChange({
      orderId,
      oldStatus: currentOrder.status,
      newStatus: status,
      restaurantId: currentOrder.restaurantId,
      tableId: currentOrder.tableId,
      orderNumber: currentOrder.orderNumber,
      timestamp: Date.now(),
      changedBy: authResult.user.type === 'staff'
        ? authResult.user.id || authResult.user.user.id
        : authResult.user.user.id,
    });

    // Send kitchen notification for status changes
    if (status === ORDER_STATUS.CONFIRMED) {
      await RedisEventManager.publishKitchenNotification({
        type: 'new_order',
        orderId,
        restaurantId: currentOrder.restaurantId,
        message: `New order ${currentOrder.orderNumber} ready for kitchen`,
        timestamp: Date.now(),
      });
    } else if (status === ORDER_STATUS.READY) {
      await RedisEventManager.publishRestaurantNotification({
        type: 'order_ready',
        orderId,
        restaurantId: currentOrder.restaurantId,
        message: `Order ${currentOrder.orderNumber} is ready for pickup`,
        timestamp: Date.now(),
      });
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;

    // Get order status history
    const statusHistory = await prisma.auditLog.findMany({
      where: {
        tableName: 'orders',
        recordId: orderId,
        operation: 'UPDATE',
      },
      include: {
        staff: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get current order details
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        estimatedReadyTime: true,
        confirmedAt: true,
        readyAt: true,
        servedAt: true,
        createdAt: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order,
      statusHistory,
    });
  } catch (error) {
    console.error('Failed to fetch order status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order status' },
      { status: 500 }
    );
  }
}
