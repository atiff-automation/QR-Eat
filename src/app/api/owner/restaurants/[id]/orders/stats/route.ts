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

    // Only restaurant owners can access their restaurant stats
    if (authResult.user.userType !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can access order stats' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        ownerId: authResult.user.id
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

    // Get order statistics
    const [totalOrders, pendingOrders, completedOrders, todayRevenue] = await Promise.all([
      // Total orders today
      prisma.order.count({
        where: {
          restaurantId,
          createdAt: {
            gte: todayStart
          }
        }
      }),

      // Pending orders (not yet completed)
      prisma.order.count({
        where: {
          restaurantId,
          status: {
            in: ['PENDING', 'PREPARING', 'READY']
          }
        }
      }),

      // Completed orders today
      prisma.order.count({
        where: {
          restaurantId,
          status: 'COMPLETED',
          createdAt: {
            gte: todayStart
          }
        }
      }),

      // Today's revenue - sum from OrderItems
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
      })
    ]);

    const stats = {
      totalOrders,
      pendingOrders,
      completedOrders,
      todayRevenue: Number(todayRevenue._sum.totalAmount || 0)
    };

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Failed to fetch order stats:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch order stats',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}