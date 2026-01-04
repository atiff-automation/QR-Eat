import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { Prisma } from '@prisma/client';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
  createRestaurantFilter,
} from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    // Get tenant context from middleware headers
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const restaurantId = url.searchParams.get('restaurantId'); // For platform admins
    const excludeServed = url.searchParams.get('excludeServed') === 'true';

    // Date filtering (New)
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');

    // Build tenant-aware where clause
    let where: Prisma.OrderWhereInput = createRestaurantFilter(context!);

    // Platform admins can optionally filter by specific restaurant
    if (context!.isAdmin && restaurantId) {
      where = { restaurantId };
    }

    // Apply Timeframe Filter
    if (startDateParam) {
      where.createdAt = {
        gte: new Date(startDateParam),
        ...(endDateParam ? { lte: new Date(endDateParam) } : {}),
      };
    }

    // Filter by status if provided
    if (status && status !== 'all') {
      where.status = status;
    }

    // Exclude served, cancelled, and completed orders when requested (for active orders view)
    // Note: 'COMPLETED' is not a valid ordering cycle status (it's for payment cycle),
    // but we exclude it as a safeguard against invalid data
    if (excludeServed && (!status || status === 'all')) {
      where.status = { notIn: ['SERVED', 'CANCELLED'] };
    }

    // Calculate lapsed active orders (Safety Check)
    // Only relevant if we are filtering by a date range (e.g. Today)
    let lapsedCount = 0;
    if (startDateParam) {
      // Check for active orders created BEFORE the start date
      const lapsedWhere: Prisma.OrderWhereInput = {
        ...createRestaurantFilter(context!), // Base tenant filter
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] }, // Active statuses
        createdAt: {
          lt: new Date(startDateParam),
        },
      };

      if (context!.isAdmin && restaurantId) {
        lapsedWhere.restaurantId = restaurantId;
      }

      lapsedCount = await prisma.order.count({ where: lapsedWhere });
    }

    // Fetch orders with related data
    const orders = await prisma.order.findMany({
      where,
      include: {
        table: {
          select: {
            tableNumber: true,
            tableName: true,
          },
        },
        customerSession: {
          select: {
            customerName: true,
            customerPhone: true,
            customerEmail: true,
          },
        },
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
        // Include restaurant data for platform admins
        restaurant: context!.isAdmin
          ? {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            }
          : false,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const totalCount = await prisma.order.count({ where });

    return NextResponse.json({
      success: true,
      orders,
      lapsedCount, // Return the safety metric
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
      userContext: {
        userType: context!.userType,
        isAdmin: context!.isAdmin,
        restaurantId: context!.restaurantId,
      },
    });
  } catch (error) {
    console.error('Failed to fetch orders:', error);

    // Handle tenant context errors
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
