import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const itemId = params.id;
    const { status } = await request.json();

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ['pending', 'preparing', 'ready'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Update the order item status
    const orderItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: { 
        status,
        updatedAt: new Date()
      },
      include: {
        order: {
          select: {
            id: true,
            restaurantId: true,
            status: true
          }
        }
      }
    });

    // Verify the item belongs to the same restaurant
    if (orderItem.order.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check if all items in the order are ready, then update order status
    if (status === 'ready') {
      const allOrderItems = await prisma.orderItem.findMany({
        where: { orderId: orderItem.order.id }
      });

      const allItemsReady = allOrderItems.every(item => item.status === 'ready');

      if (allItemsReady && orderItem.order.status === 'preparing') {
        await prisma.order.update({
          where: { id: orderItem.order.id },
          data: { 
            status: 'ready',
            readyAt: new Date(),
            updatedAt: new Date()
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      orderItem
    });

  } catch (error) {
    console.error('Failed to update order item status:', error);
    return NextResponse.json(
      { error: 'Failed to update item status' },
      { status: 500 }
    );
  }
}