/**
 * Dashboard Analytics API
 * Provides real-time analytics data for restaurant dashboards
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { Prisma } from '@prisma/client';

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
    const timeframe = url.searchParams.get('timeframe') || 'daily'; // daily, weekly, monthly, yearly

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

    // Calculate date range and grouping
    const now = new Date();
    let startDate: Date;
    let truncUnit: string;

    switch (timeframe) {
      case 'yearly':
        // Last 12 months
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        truncUnit = 'month';
        break;
      case 'monthly':
        // Last 30 days
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        truncUnit = 'day';
        break;
      case 'weekly':
        // Last 7 days
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        truncUnit = 'day';
        break;
      case 'daily':
      default:
        // Last 24 hours
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        truncUnit = 'hour';
        break;
    }

    // Create raw query parts safely
    // Primate $queryRaw uses variable substitution to prevent injection
    // But for table/column names or SQL keywords (like truncUnit), we need to handle them carefully.
    // However, DATE_TRUNC second argument is a string literal in PG, so we can pass it as a parameter if using $queryRaw,
    // or rely on the switch case above which ensures it's a safe string.

    // Because Prisma $queryRaw template literal is strict, we might need a different approach for dynamic intervals if we can't interpolate.
    // Fortunately, we can cast the unit to text or just have multiple queries.
    // For simplicity and safety with varying units, I'll use a conditional query construction or specific RAW execution.

    // Using Prisma.sql to build the unit part is one way.
    let dateTruncSql;
    if (truncUnit === 'month')
      dateTruncSql = Prisma.sql`DATE_TRUNC('month', "createdAt")`;
    else if (truncUnit === 'day')
      dateTruncSql = Prisma.sql`DATE_TRUNC('day', "createdAt")`;
    else dateTruncSql = Prisma.sql`DATE_TRUNC('hour', "createdAt")`;

    // If no restaurants, return empty data structure immediately
    if (restaurantIds.length === 0) {
      return NextResponse.json({
        success: true,
        timeframe,
        analytics: {
          overview: {
            totalOrders: 0,
            totalRevenue: 0,
            avgOrderValue: 0,
            ordersByStatus: [],
          },
          totalMenuItemsCount: 0,
          topMenuItems: [],
          trends: { sales: [] },
          tableUtilization: [],
          staffPerformance: [],
        },
      });
    }

    // Get analytics data in parallel
    const [
      totalOrders,
      totalRevenue,
      avgOrderValue,
      ordersByStatus,
      topMenuItems,
      salesTrend,
      tableUtilization,
      staffPerformance,
      totalMenuItemsCount,
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

      // Sales Trend
      prisma.$queryRaw`
        SELECT 
          ${dateTruncSql} as date,
          CAST(COUNT(*) AS INTEGER) as order_count,
          CAST(COALESCE(SUM("totalAmount"), 0) AS DOUBLE PRECISION) as revenue
        FROM "orders" 
        WHERE "restaurantId" IN (${Prisma.join(restaurantIds)})
          AND "createdAt" >= ${startDate}
          AND "status" != 'CANCELLED'
        GROUP BY 1
        ORDER BY 1 ASC
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
                  status: { not: 'CANCELLED' }, // Only count valid orders
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
              role: true,
              _count: {
                select: {
                  orders: {
                    // Changed from ordersServed to orders
                    where: {
                      createdAt: { gte: startDate },
                    },
                  },
                },
              },
            },
            orderBy: {
              orders: { _count: 'desc' }, // Changed from ordersServed to orders
            },
            take: 10,
          })
        : [],

      // Total menu items count
      prisma.menuItem.count({
        where: {
          restaurantId: { in: restaurantIds },
          isAvailable: true, // Optional: count only available items or all? Let's count all active
        },
      }),
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
        totalMenuItemsCount,
        topMenuItems: topMenuItemsWithNames,
        trends: {
          sales: salesTrend, // Now passing the dynamic trend data
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
          role: staff.role,
          ordersServed: staff._count.orders,
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
