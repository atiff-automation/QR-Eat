import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/order-utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { status, estimatedReadyTime, notes } = await request.json();
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
        restaurant: true
      }
    });

    if (!currentOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check if staff has permission to update this order
    if (currentOrder.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Prepare update data
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    // Set timestamps based on status changes
    switch (status) {
      case ORDER_STATUS.CONFIRMED:
        if (currentOrder.status === ORDER_STATUS.PENDING) {
          updateData.confirmedAt = new Date();
          updateData.confirmedBy = authResult.staff.id;
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
          updateData.servedBy = authResult.staff.id;
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
            tableName: true
          }
        },
        customerSession: {
          select: {
            customerName: true,
            customerPhone: true
          }
        },
        items: {
          include: {
            menuItem: {
              select: {
                name: true,
                preparationTime: true
              }
            }
          }
        }
      }
    });

    // Log the status change
    await prisma.auditLog.create({
      data: {
        tableName: 'orders',
        recordId: orderId,
        operation: 'UPDATE',
        oldValues: { status: currentOrder.status },
        newValues: { status },
        changedBy: authResult.staff.id,
        ipAddress: request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') ||
                   'unknown'
      }
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: `Order status updated to ${status}`
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
        operation: 'UPDATE'
      },
      include: {
        staff: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
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
        createdAt: true
      }
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      order,
      statusHistory
    });

  } catch (error) {
    console.error('Failed to fetch order status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order status' },
      { status: 500 }
    );
  }
}