import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/auth/AuthServiceV2';
import { PERMISSION_GROUPS } from '@/lib/constants/permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: restaurantId } = await params;

    // Authenticate and authorize using modern AuthServiceV2
    const authResult = await AuthServiceV2.validateToken(request, {
      requiredPermissions: [PERMISSION_GROUPS.ANALYTICS.VIEW_ANALYTICS],
      requireRestaurantId: restaurantId
    });

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || 'Authentication required' },
        { status: authResult.statusCode || 401 }
      );
    }

    // No additional verification needed - AuthServiceV2 already validated restaurant access

    // Calculate date ranges
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get today's stats
    const [todayOrders, todayRevenue, monthlyOrders, monthlyRevenue, activeStaff] = await Promise.all([
      // Today's orders count
      prisma.order.count({
        where: {
          restaurantId,
          createdAt: {
            gte: todayStart
          }
        }
      }),

      // Today's revenue
      prisma.orderItem.aggregate({
        where: {
          order: {
            restaurantId,
            createdAt: {
              gte: todayStart
            }
          }
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Monthly orders count
      prisma.order.count({
        where: {
          restaurantId,
          createdAt: {
            gte: monthStart
          }
        }
      }),

      // Monthly revenue
      prisma.orderItem.aggregate({
        where: {
          order: {
            restaurantId,
            createdAt: {
              gte: monthStart
            }
          }
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Active staff count
      prisma.staff.count({
        where: {
          restaurantId,
          isActive: true
        }
      })
    ]);

    // Get pending orders count
    const pendingOrders = await prisma.order.count({
      where: {
        restaurantId,
        status: {
          in: ['pending', 'preparing', 'ready']
        }
      }
    });

    const stats = {
      todayOrders,
      todayRevenue: todayRevenue._sum.totalAmount || 0,
      monthlyOrders,
      monthlyRevenue: monthlyRevenue._sum.totalAmount || 0,
      activeStaff,
      pendingOrders
    };

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Failed to fetch restaurant stats:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch restaurant stats',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}