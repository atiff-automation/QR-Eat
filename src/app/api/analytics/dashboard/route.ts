/**
 * Dashboard Analytics API
 * Provides real-time analytics data for restaurant dashboards
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(request: NextRequest) {
  try {
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

    const url = new URL(request.url);
    const restaurantId = url.searchParams.get('restaurantId');
    const timeframe = url.searchParams.get('timeframe') || '24h'; // 24h, 7d, 30d

    // User type check
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    // Determine which restaurant(s) to get analytics for
    let restaurantIds: string[] = [];

    if (userType === 'platform_admin') {
      if (restaurantId) {
        restaurantIds = [restaurantId];
      } else {
        // Get all restaurants
        const allRestaurants = await prisma.restaurant.findMany({
          select: { id: true },
        });
        restaurantIds = allRestaurants.map((r) => r.id);
      }
    } else if (userType === 'restaurant_owner') {
      // Get owned restaurants
      const ownedRestaurants = await prisma.restaurant.findMany({
        where: { ownerId: authResult.user.id },
        select: { id: true },
      });

      if (restaurantId) {
        const isOwned = ownedRestaurants.some((r) => r.id === restaurantId);
        if (!isOwned) {
          return NextResponse.json(
            { error: 'Access denied to this restaurant' },
            { status: 403 }
          );
        }
        restaurantIds = [restaurantId];
      } else {
        restaurantIds = ownedRestaurants.map((r) => r.id);
      }
    } else if (userType === 'staff') {
      const staffRestaurantId = authResult.user.currentRole?.restaurantId;
      if (!staffRestaurantId) {
        return NextResponse.json(
          { error: 'Restaurant access required' },
          { status: 403 }
        );
      }
      restaurantIds = [staffRestaurantId];
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '24h':
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
    }

    // Get analytics data in parallel
    const [
      totalOrders,
      totalRevenue,
      avgOrderValue,
      ordersByStatus,
      topMenuItems,
      hourlyOrders,
      tableUtilization,
      staffPerformance,
    ] = await Promise.all([
      // Total orders
      prisma.order.count({
        where: {
          restaurantId: { in: restaurantIds },
          createdAt: { gte: startDate },
        },
      }),

      // Total revenue
      prisma.order.aggregate({
        where: {
          restaurantId: { in: restaurantIds },
          status: 'SERVED',
          createdAt: { gte: startDate },
        },
        _sum: { totalAmount: true },
      }),

      // Average order value
      prisma.order.aggregate({
        where: {
          restaurantId: { in: restaurantIds },
          status: 'SERVED',
          createdAt: { gte: startDate },
        },
        _avg: { totalAmount: true },
      }),

      // Orders by status
      prisma.order.groupBy({
        by: ['status'],
        where: {
          restaurantId: { in: restaurantIds },
          createdAt: { gte: startDate },
        },
        _count: { id: true },
      }),

      // Top menu items
      prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: {
          order: {
            restaurantId: { in: restaurantIds },
            createdAt: { gte: startDate },
          },
        },
        _sum: { quantity: true },
        _count: { id: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),

      // Hourly orders for trend analysis
      prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('hour', "createdAt") as hour,
          COUNT(*) as order_count,
          SUM("totalAmount") as revenue
        FROM "orders" 
        WHERE "restaurantId" = ANY(${restaurantIds})
          AND "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('hour', "createdAt")
        ORDER BY hour ASC
      `,

      // Table utilization
      prisma.table.findMany({
        where: { restaurantId: { in: restaurantIds } },
        include: {
          _count: {
            select: {
              orders: {
                where: {
                  createdAt: { gte: startDate },
                },
              },
            },
          },
        },
      }),

      // Staff performance (if single restaurant)
      restaurantIds.length === 1
        ? prisma.staff.findMany({
            where: { restaurantId: restaurantIds[0] },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              _count: {
                select: {
                  ordersServed: {
                    where: {
                      createdAt: { gte: startDate },
                    },
                  },
                },
              },
            },
            orderBy: {
              ordersServed: { _count: 'desc' },
            },
            take: 10,
          })
        : [],
    ]);

    // Get menu item names for top items
    const menuItemIds = topMenuItems.map((item) => item.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      select: { id: true, name: true, price: true },
    });

    const topMenuItemsWithNames = topMenuItems.map((item) => {
      const menuItem = menuItems.find((mi) => mi.id === item.menuItemId);
      return {
        id: item.menuItemId,
        name: menuItem?.name || 'Unknown Item',
        quantity: item._sum.quantity || 0,
        orders: item._count.id,
        price: menuItem?.price || 0,
      };
    });

    return NextResponse.json({
      success: true,
      timeframe,
      analytics: {
        overview: {
          totalOrders,
          totalRevenue: totalRevenue._sum.totalAmount || 0,
          avgOrderValue: avgOrderValue._avg.totalAmount || 0,
          ordersByStatus: ordersByStatus.map((status) => ({
            status: status.status,
            count: status._count.id,
          })),
        },
        topMenuItems: topMenuItemsWithNames,
        trends: {
          hourlyOrders: hourlyOrders,
        },
        tableUtilization: tableUtilization.map((table) => ({
          tableNumber: table.tableNumber,
          tableName: table.tableName,
          ordersCount: table._count.orders,
          status: table.status,
        })),
        staffPerformance: staffPerformance.map((staff) => ({
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          ordersServed: staff._count.ordersServed,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
