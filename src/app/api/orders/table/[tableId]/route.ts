/**
 * Get All Orders for a Specific Table
 *
 * Returns all pending orders for a table, allowing cashier to see
 * individual orders and process payment for entire table.
 *
 * @route GET /api/orders/table/[tableId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { z } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;

    // Validate tableId
    const validTableId = z.string().uuid().parse(tableId);

    // Get all pending orders for this table
    const orders = await prisma.order.findMany({
      where: {
        tableId: validTableId,
        status: 'PENDING', // Only pending orders
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                price: true,
                imageUrl: true,
              },
            },
            selectedOptions: true,
          },
        },
        customerSession: {
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            customerEmail: true,
            startedAt: true,
          },
        },
        table: {
          select: {
            id: true,
            tableNumber: true,
            tableName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
    });

    // Calculate table totals
    const tableTotal = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0
    );

    const tableSubtotal = orders.reduce(
      (sum, order) => sum + Number(order.subtotalAmount),
      0
    );

    const tableTax = orders.reduce(
      (sum, order) => sum + Number(order.taxAmount),
      0
    );

    const tableServiceCharge = orders.reduce(
      (sum, order) => sum + Number(order.serviceCharge),
      0
    );

    return NextResponse.json({
      success: true,
      orders,
      summary: {
        totalOrders: orders.length,
        subtotal: tableSubtotal,
        tax: tableTax,
        serviceCharge: tableServiceCharge,
        total: tableTotal,
      },
    });
  } catch (error) {
    console.error('Error fetching table orders:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid table ID',
          details: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch table orders' },
      { status: 500 }
    );
  }
}
