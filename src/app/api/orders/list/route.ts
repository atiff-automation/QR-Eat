import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/database';
import { getTenantContext } from '@/lib/tenant-context';
import { ACTIVE_RECALL_SELECT, recallFields } from '@/lib/counter/recall';

export async function GET(request: NextRequest) {
  try {
    // Get tenant context from middleware headers (secure, not user-controllable)
    const context = await getTenantContext(request);

    if (!context || !context.restaurantId) {
      return NextResponse.json(
        { error: 'Unauthorized or Restaurant ID missing' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Execute query with RLS enforcement
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await withTenantContext<{
      orders: any[];
      totalCount: number;
    }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context as any,
      async (tx) => {
        const whereClause: Record<string, string> = {};

        if (status) {
          whereClause.status = status;
        }

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
                selectedOptions: true,
              },
            },
            orderRecalls: ACTIVE_RECALL_SELECT,
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
      }
    );

    return NextResponse.json({
      orders: result.orders.map(
        ({
          orderRecalls,
          ...order
        }: {
          orderRecalls?: Array<{ recalledAt: Date; reason: string | null }>;
        }) => ({
          ...order,
          ...recallFields(orderRecalls),
        })
      ),
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
