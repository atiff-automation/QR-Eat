/**
 * POS API - Get Pending Orders
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Error Handling
 * - RBAC Integration
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
  createRestaurantFilter,
} from '@/lib/tenant-context';
import { ORDER_STATUS, PAYMENT_STATUS } from '@/lib/order-utils';

export async function GET(request: NextRequest) {
  try {
    // Get tenant context and verify authentication
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build tenant-aware where clause
    // Show only orders that are READY or SERVED with pending payment
    // This ensures payment is only collected when food is ready
    // Prevents premature payment and modification conflicts
    const where = {
      ...createRestaurantFilter(context!),
      paymentStatus: PAYMENT_STATUS.PENDING,
      status: {
        in: [ORDER_STATUS.READY, ORDER_STATUS.SERVED], // Only ready/served orders
      },
    };

    // Fetch pending orders with full details
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
          },
        },
        items: {
          include: {
            menuItem: {
              select: {
                name: true,
                price: true,
                preparationTime: true,
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

    // Get total count for pagination
    const totalCount = await prisma.order.count({ where });

    return NextResponse.json({
      success: true,
      orders,
      total: totalCount,
      hasMore: offset + limit < totalCount,
    });
  } catch (error) {
    console.error('Failed to fetch pending orders:', error);

    // Handle tenant context errors
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to fetch pending orders' },
      { status: 500 }
    );
  }
}
