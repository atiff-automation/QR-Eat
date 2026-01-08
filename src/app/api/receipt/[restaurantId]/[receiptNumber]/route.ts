/**
 * Public Receipt API Route
 *
 * Provides public access to receipt data for customers
 * No authentication required
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Error Handling
 * - No Hardcoding
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ restaurantId: string; receiptNumber: string }> }
) {
  try {
    const { restaurantId, receiptNumber } = await params;

    // Validate parameters
    if (!restaurantId || !receiptNumber) {
      return NextResponse.json(
        { error: 'Restaurant ID and receipt number are required' },
        { status: 400 }
      );
    }

    // Query payment with all necessary relations
    const payment = await prisma.payment.findFirst({
      where: {
        receiptNumber: receiptNumber,
        order: {
          restaurantId: restaurantId,
        },
      },
      include: {
        order: {
          include: {
            items: {
              include: {
                menuItem: true,
              },
            },
            table: true,
            restaurant: true,
          },
        },
        processedByStaff: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        processedByOwner: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        processedByAdmin: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Receipt not found
    if (!payment) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // Get cashier info (could be staff, owner, or admin)
    const cashier = payment.processedByStaff ||
      payment.processedByOwner ||
      payment.processedByAdmin || { firstName: 'Staff', lastName: 'Member' };

    // Format response
    const receiptData = {
      receiptNumber: payment.receiptNumber,
      restaurant: {
        name: payment.order.restaurant.name,
        address: payment.order.restaurant.address,
        phone: payment.order.restaurant.phone || '',
        email: payment.order.restaurant.email || '',
        taxLabel: payment.order.restaurant.taxLabel,
        serviceChargeLabel: payment.order.restaurant.serviceChargeLabel,
      },
      order: {
        orderNumber: payment.order.orderNumber,
        tableName:
          payment.order.table.tableName || payment.order.table.tableNumber,
        items: payment.order.items.map(
          (item: (typeof payment.order.items)[number]) => ({
            name: item.menuItem.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            totalAmount: Number(item.totalAmount),
          })
        ),
        subtotalAmount: Number(payment.order.subtotalAmount),
        taxAmount: Number(payment.order.taxAmount),
        serviceCharge: Number(payment.order.serviceCharge),
        totalAmount: Number(payment.order.totalAmount),
        createdAt: payment.order.createdAt,
      },
      payment: {
        method: payment.paymentMethod,
        amount: Number(payment.amount),
        cashReceived: payment.cashReceived
          ? Number(payment.cashReceived)
          : undefined,
        changeGiven: payment.changeGiven
          ? Number(payment.changeGiven)
          : undefined,
        completedAt: payment.completedAt,
      },
      cashier: {
        firstName: cashier.firstName,
        lastName: cashier.lastName,
      },
    };

    return NextResponse.json({ receipt: receiptData });
  } catch (error) {
    console.error('Error fetching receipt:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
