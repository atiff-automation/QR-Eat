/**
 * QR Order Creation Endpoint
 *
 * Public endpoint (no authentication required) for creating orders from QR code scan.
 * Uses table-based sessions and server-side cart.
 *
 * Flow:
 * 1. Get table session (contains cart)
 * 2. Validate cart has items
 * 3. Create order from cart
 * 4. Clear cart
 * 5. Send to kitchen
 *
 * @see CLAUDE.md - Type Safety, Validation, Error Handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  generateOrderNumber,
  calculateOrderTotals,
  estimateReadyTime,
} from '@/lib/order-utils';
import { RedisEventManager } from '@/lib/redis';
import { getTableCart, clearTableCart } from '@/lib/table-session';
import { z } from 'zod';

// ============================================================================
// Validation Schema
// ============================================================================

const CreateQROrderSchema = z.object({
  tableId: z.string().uuid('Invalid table ID format'),
  customerInfo: z
    .object({
      name: z.string().min(1).max(100).optional(),
      phone: z.string().min(8).max(20).optional(),
      email: z.string().email().optional(),
    })
    .optional(),
  specialInstructions: z.string().max(500).optional(),
});

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedData = CreateQROrderSchema.parse(body);
    const { tableId, customerInfo, specialInstructions } = validatedData;

    // Get table cart (includes session and cart items)
    const tableCart = await getTableCart(tableId);

    if (!tableCart || tableCart.items.length === 0) {
      return NextResponse.json(
        { error: 'Cart is empty. Please add items before ordering.' },
        { status: 400 }
      );
    }

    // Verify table exists and get restaurant info
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        restaurant: {
          select: {
            id: true,
            taxRate: true,
            serviceChargeRate: true,
            isActive: true,
          },
        },
      },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    if (!table.restaurant.isActive) {
      return NextResponse.json(
        { error: 'Restaurant is currently closed' },
        { status: 503 }
      );
    }

    // Convert cart items to order item format for calculation
    const orderItems = tableCart.items.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.subtotal,
      specialInstructions: item.specialInstructions || undefined,
      selectedVariations: item.variation
        ? [
            {
              variationId: item.variation.id,
              quantity: 1,
              variation: {
                priceModifier: item.unitPrice - item.unitPrice, // Variation price already included in unitPrice
              },
            },
          ]
        : [],
    }));

    // Calculate order totals
    const totals = calculateOrderTotals(
      orderItems,
      parseFloat(table.restaurant.taxRate.toString()),
      parseFloat(table.restaurant.serviceChargeRate.toString())
    );

    // Generate order number
    const orderNumber = generateOrderNumber();

    // Estimate ready time
    const estimatedReadyTime = estimateReadyTime(orderItems);

    // Update customer session with customer info if provided
    if (customerInfo) {
      await prisma.customerSession.update({
        where: { id: tableCart.sessionId },
        data: {
          customerName: customerInfo.name,
          customerPhone: customerInfo.phone,
          customerEmail: customerInfo.email,
        },
      });
    }

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber,
        restaurantId: table.restaurant.id,
        tableId,
        customerSessionId: tableCart.sessionId,
        subtotalAmount: totals.subtotal,
        taxAmount: totals.taxAmount,
        serviceCharge: totals.serviceCharge,
        discountAmount: 0,
        totalAmount: totals.totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        specialInstructions,
        estimatedReadyTime,
      },
    });

    // Create order items from cart
    await Promise.all(
      tableCart.items.map(async (cartItem) => {
        const orderItem = await prisma.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: cartItem.menuItemId,
            quantity: cartItem.quantity,
            unitPrice: cartItem.unitPrice,
            totalAmount: cartItem.subtotal,
            specialInstructions: cartItem.specialInstructions,
            status: 'pending',
          },
        });

        // Create order item variations if cart item has variation
        if (cartItem.variation) {
          await prisma.orderItemVariation.create({
            data: {
              orderItemId: orderItem.id,
              variationId: cartItem.variation.id,
              quantity: 1,
              unitPrice: 0, // Price already included in unitPrice
              totalAmount: 0,
            },
          });
        }

        return orderItem;
      })
    );

    // Update table status
    await prisma.table.update({
      where: { id: tableId },
      data: { status: 'occupied' },
    });

    // Clear cart after successful order creation
    await clearTableCart(tableId);

    // Publish Redis event for new order
    await RedisEventManager.publishOrderCreated({
      orderId: order.id,
      restaurantId: table.restaurant.id,
      tableId: tableId,
      orderNumber: order.orderNumber,
      totalAmount: parseFloat(order.totalAmount.toString()),
      timestamp: Date.now(),
    });

    // Send kitchen notification for new order
    await RedisEventManager.publishKitchenNotification({
      type: 'new_order',
      orderId: order.id,
      restaurantId: table.restaurant.id,
      message: `New order ${order.orderNumber} from table ${table.tableNumber}`,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        estimatedReadyTime: order.estimatedReadyTime,
      },
      message: 'Order submitted successfully! Please pay at the counter when ready.',
    });
  } catch (error) {
    console.error('QR order creation error:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    // Handle known errors
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Handle unknown errors
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
