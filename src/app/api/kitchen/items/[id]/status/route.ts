import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value || 
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
    const userRestaurantId = authResult.user.currentRole?.restaurantId;
    if (!userRestaurantId || orderItem.order.restaurantId !== userRestaurantId) {
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