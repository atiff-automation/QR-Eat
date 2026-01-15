import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import {
  ORDER_STATUS,
  validateOrderTransition,
  getInvalidTransitionMessage,
} from '@/lib/order-utils';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { OrderStatus } from '@prisma/client';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication using RBAC system
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

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
    let hasPermission = false;
    const user = authResult.user;
    const restaurantId = user.currentRole?.restaurantId;

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Order status update permission check:', {
        userType: user.userType,
        userRestaurantId: restaurantId,
        orderRestaurantId: currentOrder.restaurantId,
        userPermissions: user.permissions,
        hasOrdersUpdate: user.permissions.includes('orders:update'),
        hasOrdersKitchen: user.permissions.includes('orders:kitchen'),
        hasOrdersRead: user.permissions.includes('orders:read'),
      });
    }

    if (user.userType === 'platform_admin') {
      hasPermission = true;
    } else if (restaurantId && currentOrder.restaurantId === restaurantId) {
      // Check if user has permission to update orders in this restaurant
      hasPermission =
        user.permissions.includes('orders:update') ||
        user.permissions.includes('orders:kitchen') ||
        user.permissions.includes('orders:read'); // Allow read permission to update status
    }

    if (!hasPermission) {
      console.error('❌ Access denied for order status update:', {
        userType: user.userType,
        userRestaurantId: restaurantId,
        orderRestaurantId: currentOrder.restaurantId,
        userPermissions: user.permissions,
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
    } = {
      status: status as OrderStatus,
      updatedAt: new Date(),
    };

    // Set timestamps based on status changes
    switch (status) {
      case ORDER_STATUS.CONFIRMED:
        if (currentOrder.status === ORDER_STATUS.PENDING) {
          updateData.confirmedAt = new Date();
          updateData.confirmedBy = authResult.user.id;
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
          updateData.servedBy = authResult.user.id;
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
        changedBy: authResult.user.id,
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
      changedBy: authResult.user.id,
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

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
      orderBy: { changedAt: 'asc' as const },
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
