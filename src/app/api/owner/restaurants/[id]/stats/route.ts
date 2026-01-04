import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { ANALYTICS_PERMISSIONS } from '@/lib/rbac/permission-constants';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: restaurantId } = await params;

    // Authenticate and authorize using RBAC middleware
    const auth = await requireAuth(request, [ANALYTICS_PERMISSIONS.READ]);

    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    // No additional verification needed - RBAC middleware already validated authentication

    // Calculate date ranges
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get today's stats
    const [
      todayOrders,
      todayRevenue,
      monthlyOrders,
      monthlyRevenue,
      activeStaff,
    ] = await Promise.all([
      // Today's orders count
      prisma.order.count({
        where: {
          restaurantId,
          createdAt: {
            gte: todayStart,
          },
        },
      }),

      // Today's revenue
      prisma.orderItem.aggregate({
        where: {
          order: {
            restaurantId,
            createdAt: {
              gte: todayStart,
            },
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),

      // Monthly orders count
      prisma.order.count({
        where: {
          restaurantId,
          createdAt: {
            gte: monthStart,
          },
        },
      }),

      // Monthly revenue
      prisma.orderItem.aggregate({
        where: {
          order: {
            restaurantId,
            createdAt: {
              gte: monthStart,
            },
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),

      // Active staff count
      prisma.staff.count({
        where: {
          restaurantId,
          isActive: true,
        },
      }),
    ]);

    // Get pending orders count
    const pendingOrders = await prisma.order.count({
      where: {
        restaurantId,
        status: {
          in: ['PENDING', 'PREPARING', 'READY'],
        },
      },
    });

    const stats = {
      todayOrders,
      todayRevenue: todayRevenue._sum.totalAmount || 0,
      monthlyOrders,
      monthlyRevenue: monthlyRevenue._sum.totalAmount || 0,
      activeStaff,
      pendingOrders,
    };

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Failed to fetch restaurant stats:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch restaurant stats',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
