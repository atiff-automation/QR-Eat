import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'today'; // today, week, month

    // Calculate date range based on period
    let startDate: Date;
    const endDate = new Date();
    
    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'today':
      default:
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
    }

    const where = {
      restaurantId: authResult.staff.restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    };

    // Get order statistics
    const [
      totalOrders,
      pendingOrders,
      confirmedOrders,
      preparingOrders,
      readyOrders,
      servedOrders,
      cancelledOrders,
      orderTotals
    ] = await Promise.all([
      // Total orders
      prisma.order.count({ where }),
      
      // Orders by status
      prisma.order.count({ where: { ...where, status: 'pending' } }),
      prisma.order.count({ where: { ...where, status: 'confirmed' } }),
      prisma.order.count({ where: { ...where, status: 'preparing' } }),
      prisma.order.count({ where: { ...where, status: 'ready' } }),
      prisma.order.count({ where: { ...where, status: 'served' } }),
      prisma.order.count({ where: { ...where, status: 'cancelled' } }),
      
      // Revenue calculations
      prisma.order.aggregate({
        where: {
          ...where,
          status: { not: 'cancelled' }
        },
        _sum: {
          totalAmount: true
        },
        _avg: {
          totalAmount: true
        }
      })
    ]);

    // Calculate additional metrics
    const totalRevenue = orderTotals._sum.totalAmount || 0;
    const averageOrderValue = orderTotals._avg.totalAmount || 0;

    // Get hourly order distribution for today (using Prisma instead of raw SQL)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayOrders = await prisma.order.findMany({
      where: {
        restaurantId: authResult.staff.restaurantId,
        createdAt: {
          gte: today,
          lt: tomorrow
        }
      },
      select: {
        createdAt: true,
        totalAmount: true
      }
    });

    // Process hourly stats in JavaScript
    const hourlyStats = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      order_count: 0,
      revenue: 0
    }));

    todayOrders.forEach(order => {
      const hour = order.createdAt.getHours();
      hourlyStats[hour].order_count += 1;
      hourlyStats[hour].revenue += Number(order.totalAmount);
    });

    // Get top menu items
    const topMenuItems = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: where
      },
      _sum: {
        quantity: true,
        totalPrice: true
      },
      _count: {
        id: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: 5
    });

    // Get menu item details for top items
    const topItemsWithDetails = await Promise.all(
      topMenuItems.map(async (item) => {
        const menuItem = await prisma.menuItem.findUnique({
          where: { id: item.menuItemId },
          select: { name: true, price: true }
        });
        return {
          ...item,
          menuItem
        };
      })
    );

    const stats = {
      totalOrders,
      pendingOrders,
      confirmedOrders,
      preparingOrders,
      readyOrders,
      servedOrders,
      cancelledOrders,
      totalRevenue: Number(totalRevenue),
      averageOrderValue: Number(averageOrderValue),
      hourlyStats,
      topMenuItems: topItemsWithDetails,
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    };

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Failed to fetch order statistics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}