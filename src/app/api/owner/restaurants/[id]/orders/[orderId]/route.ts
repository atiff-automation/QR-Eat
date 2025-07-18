import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken, UserType } from '@/lib/auth';

// GET - Get order details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id: restaurantId, orderId } = await params;
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners can access their restaurant orders
    if (authResult.user.type !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can access orders' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner and order belongs to restaurant
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId,
        restaurant: {
          ownerId: authResult.user.user.id
        }
      },
      include: {
        orderItems: {
          include: {
            menuItem: {
              select: {
                name: true,
                price: true,
                description: true
              }
            },
            variations: {
              include: {
                variation: {
                  select: {
                    name: true,
                    priceModifier: true
                  }
                }
              }
            }
          }
        },
        table: {
          select: {
            number: true,
            name: true
          }
        },
        customerSession: {
          select: {
            customerName: true,
            customerPhone: true,
            customerEmail: true
          }
        }
      }
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found or access denied' },
        { status: 404 }
      );
    }

    // Format order for response
    const formattedOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotalAmount: Number(order.subtotalAmount),
      taxAmount: Number(order.taxAmount),
      serviceCharge: Number(order.serviceCharge),
      discountAmount: Number(order.discountAmount),
      totalAmount: Number(order.totalAmount),
      specialInstructions: order.specialInstructions,
      estimatedReadyTime: order.estimatedReadyTime?.toISOString(),
      createdAt: order.createdAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString(),
      readyAt: order.readyAt?.toISOString(),
      servedAt: order.servedAt?.toISOString(),
      table: order.table ? {
        number: order.table.number,
        name: order.table.name
      } : null,
      customer: order.customerSession ? {
        name: order.customerSession.customerName,
        phone: order.customerSession.customerPhone,
        email: order.customerSession.customerEmail
      } : null,
      orderItems: order.orderItems.map(item => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalAmount: Number(item.totalAmount),
        specialInstructions: item.specialInstructions,
        status: item.status,
        menuItem: {
          name: item.menuItem.name,
          price: Number(item.menuItem.price),
          description: item.menuItem.description
        },
        variations: item.variations.map(variation => ({
          id: variation.id,
          quantity: variation.quantity,
          unitPrice: Number(variation.unitPrice),
          totalAmount: Number(variation.totalAmount),
          variation: {
            name: variation.variation.name,
            priceModifier: Number(variation.variation.priceModifier)
          }
        }))
      }))
    };

    return NextResponse.json({
      success: true,
      order: formattedOrder
    });

  } catch (error) {
    console.error('Failed to fetch order details:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch order details',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// PATCH - Update order status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id: restaurantId, orderId } = await params;
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners can update orders
    if (authResult.user.type !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can update orders' },
        { status: 403 }
      );
    }

    const { status } = await request.json();

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Verify the restaurant belongs to the owner and order belongs to restaurant
    const existingOrder = await prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId,
        restaurant: {
          ownerId: authResult.user.user.id
        }
      }
    });

    if (!existingOrder) {
      return NextResponse.json(
        { error: 'Order not found or access denied' },
        { status: 404 }
      );
    }

    // Prepare update data based on status
    const updateData: any = { status };
    const now = new Date();

    switch (status) {
      case 'preparing':
        if (existingOrder.status === 'pending') {
          updateData.confirmedAt = now;
          updateData.confirmedBy = authResult.user.user.id;
        }
        break;
      case 'ready':
        if (!existingOrder.confirmedAt) {
          updateData.confirmedAt = now;
          updateData.confirmedBy = authResult.user.user.id;
        }
        updateData.readyAt = now;
        break;
      case 'completed':
        if (!existingOrder.confirmedAt) {
          updateData.confirmedAt = now;
          updateData.confirmedBy = authResult.user.user.id;
        }
        if (!existingOrder.readyAt) {
          updateData.readyAt = now;
        }
        updateData.servedAt = now;
        updateData.servedBy = authResult.user.user.id;
        break;
      case 'cancelled':
        // Orders can be cancelled at any stage
        break;
    }

    // Update the order
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      message: `Order ${status} successfully`,
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        confirmedAt: updatedOrder.confirmedAt?.toISOString(),
        readyAt: updatedOrder.readyAt?.toISOString(),
        servedAt: updatedOrder.servedAt?.toISOString()
      }
    });

  } catch (error) {
    console.error('Failed to update order:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update order',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}