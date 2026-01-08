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

    console.log('[Receipt API] Looking up receipt:', {
      receiptNumber,
      restaurantId,
    });

    // For table payments, we need to find ALL payments with the same primaryReceipt
    // and consolidate them (just like the POS receipt modal does)
    const payments = await prisma.payment.findMany({
      where: {
        OR: [
          {
            // Direct match for single order payments
            receiptNumber: receiptNumber,
            order: {
              restaurantId: restaurantId,
            },
          },
          {
            // Match primary receipt for table payments
            paymentMetadata: {
              path: ['primaryReceipt'],
              equals: receiptNumber,
            },
            order: {
              restaurantId: restaurantId,
            },
          },
        ],
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
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log(
      '[Receipt API] Query result:',
      payments.length,
      'payment(s) found'
    );

    // Receipt not found
    if (payments.length === 0) {
      console.log('[Receipt API] Receipt not found for:', {
        receiptNumber,
        restaurantId,
      });
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // Get cashier info from first payment (all payments have same cashier)
    const firstPayment = payments[0];
    const cashier = firstPayment.processedByStaff ||
      firstPayment.processedByOwner ||
      firstPayment.processedByAdmin || {
        firstName: 'Staff',
        lastName: 'Member',
      };

    // Check if this is a table payment (multiple payments with same primary receipt)
    const isTablePayment = payments.length > 1;

    // Consolidate data (matching the POS receipt modal behavior)
    const allItems = payments.flatMap((payment) =>
      payment.order.items.map((item) => ({
        name: item.menuItem.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalAmount: Number(item.totalAmount),
      }))
    );

    const totalSubtotal = payments.reduce(
      (sum, p) => sum + Number(p.order.subtotalAmount),
      0
    );
    const totalTax = payments.reduce(
      (sum, p) => sum + Number(p.order.taxAmount),
      0
    );
    const totalServiceCharge = payments.reduce(
      (sum, p) => sum + Number(p.order.serviceCharge),
      0
    );
    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.order.totalAmount),
      0
    );

    // Get cash received and change from first payment (where it's stored for table payments)
    const cashReceived = firstPayment.cashReceived
      ? Number(firstPayment.cashReceived)
      : undefined;
    const changeGiven = firstPayment.changeGiven
      ? Number(firstPayment.changeGiven)
      : undefined;

    // Format response (matching POS receipt modal structure)
    const receiptData = {
      receiptNumber: receiptNumber, // Use primary receipt number
      restaurant: {
        name: firstPayment.order.restaurant.name,
        address: firstPayment.order.restaurant.address,
        phone: firstPayment.order.restaurant.phone || '',
        email: firstPayment.order.restaurant.email || '',
        taxLabel: firstPayment.order.restaurant.taxLabel,
        serviceChargeLabel: firstPayment.order.restaurant.serviceChargeLabel,
      },
      order: {
        orderNumber: isTablePayment
          ? `TABLE-${payments.length}-ORDERS`
          : firstPayment.order.orderNumber,
        tableName:
          firstPayment.order.table.tableName ||
          firstPayment.order.table.tableNumber,
        items: allItems, // All items from all orders
        subtotalAmount: totalSubtotal,
        taxAmount: totalTax,
        serviceCharge: totalServiceCharge,
        totalAmount: totalAmount,
        createdAt: firstPayment.order.createdAt,
      },
      payment: {
        method: firstPayment.paymentMethod,
        amount: totalAmount, // Total amount for all orders
        cashReceived: cashReceived,
        changeGiven: changeGiven,
        completedAt: firstPayment.completedAt,
      },
      cashier: {
        firstName: cashier.firstName,
        lastName: cashier.lastName,
      },
    };

    console.log('[Receipt API] Returning consolidated receipt:', {
      isTablePayment,
      paymentsCount: payments.length,
      itemsCount: allItems.length,
      totalAmount,
    });

    return NextResponse.json({ receipt: receiptData });
  } catch (error) {
    console.error('Error fetching receipt:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
