import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken, UserType } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: restaurantId } = await params;
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners can access restaurant stats
    if (authResult.user.type !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can access these stats' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        ownerId: authResult.user.user.id
      }
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found or access denied' },
        { status: 404 }
      );
    }

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