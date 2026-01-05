/**
 * Table Orders API Endpoint
 *
 * GET /api/tables/{tableId}/orders
 *
 * Fetches all active (unpaid) orders for a specific table.
 * Used by TableDetailModal to display orders and calculate table total.
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - RBAC Integration
 * - Error Handling
 * - Single Responsibility
 *
 * @see implementation_plan.md - Phase 1: Backend API
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireTableAccess } from '@/lib/rbac/resource-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get tenant context and verify authentication
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    const { id: tableId } = await params;

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireTableAccess(tableId, context!);

    // Verify table exists
    const table = await prisma.table.findUnique({
      where: {
        id: tableId,
      },
      select: {
        id: true,
        tableNumber: true,
        tableName: true,
      },
    });

    if (!table) {
      return NextResponse.json(
        { success: false, error: 'Table not found' },
        { status: 404 }
      );
    }

    // Fetch all unpaid orders for this table
    const orders = await prisma.order.findMany({
      where: {
        tableId: tableId,
        paymentStatus: 'PENDING', // Only unpaid orders
      },
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
                preparationTime: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
    });

    // Calculate totals
    const tableTotal = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0
    );

    // Also get paid orders total for reference
    const paidOrders = await prisma.order.aggregate({
      where: {
        tableId: tableId,
        paymentStatus: 'PAID',
      },
      _sum: {
        totalAmount: true,
      },
    });

    const paidTotal = Number(paidOrders._sum.totalAmount || 0);

    return NextResponse.json({
      success: true,
      orders,
      tableTotal,
      paidTotal,
      tableId: table.id,
      tableNumber: table.tableNumber,
    });
  } catch (error) {
    console.error('Failed to fetch table orders:', error);

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
      { success: false, error: 'Failed to fetch table orders' },
      { status: 500 }
    );
  }
}
