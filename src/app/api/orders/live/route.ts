import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(request: NextRequest) {
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

    // Get restaurant ID from RBAC payload
    const restaurantId = authResult.user.currentRole?.restaurantId;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant access required' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const since = url.searchParams.get('since');
    const status = url.searchParams.get('status');

    // Build where clause
    const whereClause: any = {
      restaurantId: restaurantId
    };

    if (since) {
      whereClause.updatedAt = {
        gte: new Date(since)
      };
    }

    if (status) {
      whereClause.status = status;
    }

    // Get live orders with real-time updates
    const liveOrders = await prisma.order.findMany({
      where: whereClause,
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
                preparationTime: true,
                category: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate real-time metrics
    const now = new Date();
    const ordersWithMetrics = liveOrders.map(order => {
      let estimatedCompletion = null;
      let timeRemaining = null;
      let isOverdue = false;

      if (order.estimatedReadyTime) {
        estimatedCompletion = order.estimatedReadyTime;
        timeRemaining = Math.max(0, Math.round((estimatedCompletion.getTime() - now.getTime()) / 60000));
        isOverdue = now > estimatedCompletion && !['SERVED', 'CANCELLED'].includes(order.status);
      }

      return {
        ...order,
        estimatedCompletion,
        timeRemaining,
        isOverdue,
        preparationProgress: calculatePreparationProgress(order, now)
      };
    });

    // Get kitchen performance metrics
    const kitchenMetrics = await getKitchenMetrics(restaurantId);

    return NextResponse.json({
      success: true,
      orders: ordersWithMetrics,
      metrics: kitchenMetrics,
      timestamp: now.toISOString()
    });

  } catch (error) {
    console.error('Failed to fetch live orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live orders' },
      { status: 500 }
    );
  }
}

function calculatePreparationProgress(order: any, now: Date): number {
  if (!order.confirmedAt || ['SERVED', 'CANCELLED'].includes(order.status)) {
    return order.status === 'SERVED' ? 100 : 0;
  }

  const totalEstimatedTime = order.items.reduce((total: number, item: any) => {
    return total + (item.menuItem.preparationTime || 0);
  }, 0);

  if (totalEstimatedTime === 0) return 0;

  const elapsedTime = Math.round((now.getTime() - order.confirmedAt.getTime()) / 60000);
  const progress = Math.min(100, Math.max(0, (elapsedTime / totalEstimatedTime) * 100));

  return Math.round(progress);
}

async function getKitchenMetrics(restaurantId: string) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  // Active orders count by status
  const activeOrdersCounts = await prisma.order.groupBy({
    by: ['status'],
    where: {
      restaurantId,
      status: {
        in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY']
      }
    },
    _count: {
      id: true
    }
  });

  // Average preparation time today
  const completedOrdersToday = await prisma.order.findMany({
    where: {
      restaurantId,
      status: 'SERVED',
      servedAt: {
        gte: startOfDay
      },
      confirmedAt: {
        not: null
      }
    },
    select: {
      confirmedAt: true,
      readyAt: true
    }
  });

  const avgPrepTime = completedOrdersToday.length > 0
    ? completedOrdersToday.reduce((sum, order) => {
      if (order.confirmedAt && order.readyAt) {
        return sum + (order.readyAt.getTime() - order.confirmedAt.getTime());
      }
      return sum;
    }, 0) / completedOrdersToday.length / 60000 // Convert to minutes
    : 0;

  // Orders completed in last hour
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const ordersLastHour = await prisma.order.count({
    where: {
      restaurantId,
      status: 'SERVED',
      servedAt: {
        gte: lastHour
      }
    }
  });

  return {
    activeOrders: activeOrdersCounts.reduce((acc, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {} as Record<string, number>),
    averagePreparationTime: Math.round(avgPrepTime),
    ordersCompletedLastHour: ordersLastHour,
    totalActiveOrders: activeOrdersCounts.reduce((sum, item) => sum + item._count.id, 0)
  };
}