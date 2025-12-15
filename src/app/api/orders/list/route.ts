import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/database';
import { getTenantContext } from '@/lib/get-tenant-context';

export async function GET(request: NextRequest) {
  try {
    // Get tenant context from middleware headers (secure, not user-controllable)
    const context = await getTenantContext(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Execute query with RLS enforcement
    const result = await withTenantContext(context, async (tx) => {
      const whereClause: Record<string, string> = {};

      if (status) {
        whereClause.status = status;
      }

      // RLS automatically filters by restaurantId - no need to add it to WHERE
      const orders = await tx.order.findMany({
        where: whereClause,
        include: {
          table: {
            select: {
              tableNumber: true,
              tableName: true,
            },
          },
          items: {
            include: {
              menuItem: {
                select: {
                  name: true,
                  description: true,
                  preparationTime: true,
                },
              },
              variations: {
                include: {
                  variation: {
                    select: {
                      name: true,
                      variationType: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      });

      const totalCount = await tx.order.count({
        where: whereClause,
      });

      return { orders, totalCount };
    });

    return NextResponse.json({
      orders: result.orders,
      pagination: {
        total: result.totalCount,
        limit,
        offset,
        hasMore: offset + limit < result.totalCount,
      },
    });
  } catch (error) {
    console.error('Orders list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
