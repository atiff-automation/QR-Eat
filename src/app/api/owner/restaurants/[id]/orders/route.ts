import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { UserType } from '@/lib/rbac/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: restaurantId } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const date = searchParams.get('date');

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

    // Only restaurant owners can access their restaurant orders
    if (authResult.user.userType !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can access orders' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        ownerId: authResult.user.id,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found or access denied' },
        { status: 404 }
      );
    }

    // Build date filter
    let dateFilter = {};
    const now = new Date();

    switch (date) {
      case 'today':
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        dateFilter = {
          createdAt: {
            gte: todayStart,
            lt: todayEnd,
          },
        };
        break;
      case 'yesterday':
        const yesterdayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 1
        );
        const yesterdayEnd = new Date(
          yesterdayStart.getTime() + 24 * 60 * 60 * 1000
        );
        dateFilter = {
          createdAt: {
            gte: yesterdayStart,
            lt: yesterdayEnd,
          },
        };
        break;
      case 'week':
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = {
          createdAt: {
            gte: weekStart,
          },
        };
        break;
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = {
          createdAt: {
            gte: monthStart,
          },
        };
        break;
      default:
        // All time - no date filter
        break;
    }

    // Build status filter
    let statusFilter = {};
    if (status && status !== 'all') {
      statusFilter = { status };
    }

    // Fetch orders
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...statusFilter,
        ...dateFilter,
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                name: true,
                price: true,
              },
            },
          },
        },
        table: {
          select: {
            number: true,
          },
        },
        customerSession: {
          select: {
            customerName: true,
            customerPhone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format orders for response
    const formattedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      tableNumber: order.table?.number,
      customerName: order.customerSession?.customerName,
      customerPhone: order.customerSession?.customerPhone,
      orderType: order.tableId ? 'dine-in' : 'takeout',
      orderItems: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        totalAmount: Number(item.totalAmount),
        menuItem: {
          name: item.menuItem.name,
          price: Number(item.menuItem.price),
        },
      })),
    }));

    return NextResponse.json({
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch orders',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
