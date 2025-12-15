import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getTenantContext } from '@/lib/tenant-context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: {
          select: {
            tableNumber: true,
            tableName: true,
          },
        },
        items: {
          include: {
            menuItem: {
              select: {
                name: true,
                description: true,
                preparationTime: true,
              },
            },
            variations: {
              include: {
                variation: {
                  select: {
                    name: true,
                    variationType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Order fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication for PATCH operations (staff only)
    const context = await getTenantContext(request);

    if (!context?.userId) {
      return NextResponse.json(
        { error: 'Authentication required to update order status' },
        { status: 401 }
      );
    }

    const { id: orderId } = await params;
    const { status, estimatedReadyTime } = await request.json();

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Update order status
    const updateData: Record<string, string | Date> = {
      status,
      updatedAt: new Date(),
    };

    // Set timestamps based on status
    if (status === 'confirmed' && !updateData.confirmedAt) {
      updateData.confirmedAt = new Date();
    } else if (status === 'ready' && !updateData.readyAt) {
      updateData.readyAt = new Date();
    } else if (status === 'served' && !updateData.servedAt) {
      updateData.servedAt = new Date();
    }

    if (estimatedReadyTime) {
      updateData.estimatedReadyTime = new Date(estimatedReadyTime);
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        table: {
          select: {
            tableNumber: true,
            tableName: true,
          },
        },
        items: {
          include: {
            menuItem: {
              select: {
                name: true,
                description: true,
                preparationTime: true,
              },
            },
            variations: {
              include: {
                variation: {
                  select: {
                    name: true,
                    variationType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Update table status if order is completed/cancelled
    if (status === 'served' || status === 'cancelled') {
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'available' },
      });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Order update error:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}
