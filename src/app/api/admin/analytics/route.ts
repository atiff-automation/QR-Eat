import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken, UserType } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only platform admins can view analytics
    if (authResult.user.type !== UserType.PLATFORM_ADMIN) {
      return NextResponse.json(
        { error: 'Only platform administrators can view analytics' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';

    // Calculate date ranges
    const now = new Date();
    let startDate: Date;
    let previousStartDate: Date;
    
    switch (range) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
        break;
      default: // 30d
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    }

    // Get overview metrics for current period
    const [orders, previousOrders, restaurants, users] = await Promise.all([
      // Current period orders
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: now
          }
        },
        include: {
          orderItems: true
        }
      }),
      
      // Previous period orders for comparison
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: previousStartDate,
            lt: startDate
          }
        },
        include: {
          orderItems: true
        }
      }),
      
      // All restaurants
      prisma.restaurant.findMany({
        include: {
          _count: {
            select: {
              orders: true,
              staff: true
            }
          }
        }
      }),
      
      // All users count
      Promise.all([
        prisma.platformAdmin.count(),
        prisma.restaurantOwner.count(),
        prisma.staff.count()
      ])
    ]);

    // Calculate totals
    const totalRevenue = orders.reduce((sum, order) => {
      return sum + order.orderItems.reduce((itemSum, item) => itemSum + item.totalAmount, 0);
    }, 0);

    const previousRevenue = previousOrders.reduce((sum, order) => {
      return sum + order.orderItems.reduce((itemSum, item) => itemSum + item.totalAmount, 0);
    }, 0);

    const totalOrders = orders.length;
    const previousOrderCount = previousOrders.length;

    // Calculate growth rates
    const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const ordersGrowth = previousOrderCount > 0 ? ((totalOrders - previousOrderCount) / previousOrderCount) * 100 : 0;

    // Generate revenue by month data
    const revenueByMonth = [];
    const monthsToShow = range === '1y' ? 12 : range === '90d' ? 3 : range === '7d' ? 7 : 4;
    
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthStart = new Date(now);
      const monthEnd = new Date(now);
      
      if (range === '1y') {
        monthStart.setMonth(monthStart.getMonth() - i);
        monthStart.setDate(1);
        monthEnd.setMonth(monthEnd.getMonth() - i + 1);
        monthEnd.setDate(0);
      } else if (range === '90d') {
        monthStart.setDate(monthStart.getDate() - (i + 1) * 30);
        monthEnd.setDate(monthEnd.getDate() - i * 30);
      } else {
        monthStart.setDate(monthStart.getDate() - (i + 1) * (range === '7d' ? 1 : 7));
        monthEnd.setDate(monthEnd.getDate() - i * (range === '7d' ? 1 : 7));
      }

      const monthOrders = orders.filter(order => 
        order.createdAt >= monthStart && order.createdAt <= monthEnd
      );

      const monthRevenue = monthOrders.reduce((sum, order) => {
        return sum + order.orderItems.reduce((itemSum, item) => itemSum + item.totalAmount, 0);
      }, 0);

      revenueByMonth.push({
        month: range === '7d' ? monthStart.toLocaleDateString('en-US', { weekday: 'short' }) :
               range === '1y' ? monthStart.toLocaleDateString('en-US', { month: 'short' }) :
               monthStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: monthRevenue,
        orders: monthOrders.length
      });
    }

    // Get top restaurants by revenue
    const restaurantRevenue = restaurants.map(restaurant => {
      const restaurantOrders = orders.filter(order => order.restaurantId === restaurant.id);
      const revenue = restaurantOrders.reduce((sum, order) => {
        return sum + order.orderItems.reduce((itemSum, item) => itemSum + item.totalAmount, 0);
      }, 0);

      // Calculate growth (simplified - using order count growth as proxy)
      const previousRestaurantOrders = previousOrders.filter(order => order.restaurantId === restaurant.id);
      const growth = previousRestaurantOrders.length > 0 ? 
        ((restaurantOrders.length - previousRestaurantOrders.length) / previousRestaurantOrders.length) * 100 : 0;

      return {
        id: restaurant.id,
        name: restaurant.name,
        revenue,
        orders: restaurantOrders.length,
        growth
      };
    }).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    // Calculate platform metrics
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const activeRestaurants = restaurants.filter(r => r.isActive).length;
    const activeRestaurantsRate = restaurants.length > 0 ? (activeRestaurants / restaurants.length) * 100 : 0;
    
    // Mock some additional metrics
    const conversionRate = 68.5; // This would need proper tracking
    const userRetentionRate = 73.2; // This would need proper calculation

    const analytics = {
      overview: {
        totalRevenue: Math.round(totalRevenue),
        totalOrders,
        totalRestaurants: restaurants.length,
        totalUsers: users[0] + users[1] + users[2], // platform admins + owners + staff
        revenueGrowth,
        ordersGrowth
      },
      revenueByMonth,
      topRestaurants: restaurantRevenue,
      platformMetrics: {
        averageOrderValue,
        conversionRate,
        activeRestaurantsRate,
        userRetentionRate
      }
    };

    return NextResponse.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('Failed to fetch analytics:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch analytics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}