/**
 * QR Order Creation Endpoint
 * Build: 2026-01-04
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
import { calculateOrderTotals, estimateReadyTime } from '@/lib/order-utils';
import { SequenceManager } from '@/lib/sequence-manager';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { getTableCart, clearTableCart } from '@/lib/table-session';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { z } from 'zod';
import {
  canTableAcceptOrders,
  getTableUnavailableMessage,
} from '@/lib/table-utils';

// ============================================================================
// Validation Schema
// ============================================================================

const CreateQROrderSchema = z.object({
  tableId: z.string().uuid('Invalid table ID format'),
  sessionId: z.string().uuid('Invalid session ID format').optional(),
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
    const { tableId, sessionId, customerInfo, specialInstructions } =
      validatedData;

    // Get table cart (includes session and cart items)
    // Pass sessionId to get the correct customer's cart
    const tableCart = await getTableCart(tableId, sessionId);

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
            // Select labels for snapshotting
            taxLabel: true,
            serviceChargeLabel: true,
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

    console.log('🔍 [QR ORDER CREATE] Table status check:', {
      tableId: table.id,
      tableNumber: table.tableNumber,
      status: table.status,
      statusType: typeof table.status,
    });

    // ✅ STRICT VALIDATION: Prevent ordering from unavailable tables (RESERVED or INACTIVE)
    if (!canTableAcceptOrders(table.status)) {
      const { message } = getTableUnavailableMessage(table.status);
      console.log(`❌ [QR ORDER CREATE] Blocking ${table.status} table`);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.log(
      '✅ [QR ORDER CREATE] Table status check passed, allowing order'
    );

    // Fetch full menu items for calculation (need preparationTime)
    const menuItemIds = tableCart.items.map((item) => item.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      select: {
        id: true,
        name: true,
        price: true,
        preparationTime: true,
        imageUrl: true,
        description: true,
        allergens: true,
        dietaryInfo: true,
        isAvailable: true,
        isFeatured: true,
        displayOrder: true,
        costPrice: true,
        calories: true,
      },
    });

    const menuItemsMap = new Map(menuItems.map((item) => [item.id, item]));

    // Convert cart items to CartItem format for calculation
    // We cast to any here because table-session returns a subset of VariationOption
    // but strict typing isn't needed for calculation, which uses .totalPrice
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderItems: any[] = tableCart.items.map((item) => {
      const menuItem = menuItemsMap.get(item.menuItemId);
      if (!menuItem) {
        throw new Error(`Menu item ${item.menuItemId} not found`);
      }

      return {
        id: item.id,
        menuItemId: item.menuItemId,
        menuItem: {
          id: menuItem.id,
          name: menuItem.name,
          price: Number(menuItem.price),
          preparationTime: menuItem.preparationTime,
          imageUrl: menuItem.imageUrl ?? undefined,
          description: menuItem.description ?? undefined,
          allergens: menuItem.allergens,
          dietaryInfo: menuItem.dietaryInfo,
          isAvailable: menuItem.isAvailable,
          isFeatured: menuItem.isFeatured,
          displayOrder: menuItem.displayOrder,
          costPrice: menuItem.costPrice
            ? Number(menuItem.costPrice)
            : undefined,
          calories: menuItem.calories ?? undefined,
          variationGroups: [], // Not needed for calculation
        },
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.subtotal,
        specialInstructions: item.specialInstructions || undefined,
        // Map table-session options to the structure expected by types (roughly)
        selectedOptions: item.selectedOptions,
      };
    });

    // Calculate order totals
    const totals = calculateOrderTotals(
      orderItems,
      parseFloat(table.restaurant.taxRate.toString()),
      parseFloat(table.restaurant.serviceChargeRate.toString())
    );

    // Generate sequential order number
    const { number: dailySeq, formatted: orderNumber } =
      await SequenceManager.getNextOrder(table.restaurant.id);

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
        dailySeq,
        restaurantId: table.restaurant.id,
        tableId,
        customerSessionId: tableCart.sessionId,
        subtotalAmount: totals.subtotal,
        taxAmount: totals.taxAmount,
        serviceCharge: totals.serviceCharge,
        discountAmount: 0,
        totalAmount: totals.totalAmount,

        // Snapshot rates and labels for integrity
        taxRateSnapshot: table.restaurant.taxRate,
        serviceChargeRateSnapshot: table.restaurant.serviceChargeRate,
        taxLabelSnapshot: table.restaurant.taxLabel,
        serviceChargeLabelSnapshot: table.restaurant.serviceChargeLabel,

        status: 'PENDING',
        paymentStatus: 'PENDING',
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
            status: 'PENDING',
          },
        });

        // Create order item options snapshots
        if (cartItem.selectedOptions && cartItem.selectedOptions.length > 0) {
          await prisma.orderItemOption.createMany({
            data: cartItem.selectedOptions.map((opt) => ({
              orderItemId: orderItem.id,
              name: opt.name,
              priceModifier: opt.priceModifier,
            })),
          });
        }

        return orderItem;
      })
    );

    // Update table status to occupied when order is placed
    // This is the PRIMARY trigger for marking a table as occupied
    const previousTableStatus = table.status;

    if (previousTableStatus !== 'OCCUPIED') {
      await prisma.table.update({
        where: { id: tableId },
        data: { status: 'OCCUPIED' },
      });

      console.log(
        `[OrderCreate] Table ${table.tableNumber} (${tableId}) marked as occupied (was: ${previousTableStatus})`
      );

      // Real-time table status update notification
      await PostgresEventManager.publishTableStatusChange({
        tableId,
        restaurantId: table.restaurant.id,
        previousStatus: previousTableStatus,
        newStatus: 'OCCUPIED',
        updatedBy: 'customer',
        timestamp: Date.now(),
      });
    } else {
      console.log(
        `[OrderCreate] Table ${table.tableNumber} (${tableId}) already occupied, no status change needed`
      );
    }

    // Clear cart after successful order creation
    await clearTableCart(tableId);

    // End the customer session
    await prisma.customerSession.update({
      where: { id: tableCart.sessionId },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
      },
    });

    // Send real-time notification via PostgreSQL NOTIFY
    await PostgresEventManager.publishOrderCreated({
      orderId: order.id,
      restaurantId: table.restaurant.id,
      tableId,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      timestamp: Date.now(),
    });

    // Ensure table status is consistent (safety check)
    // We await this to ensure the UI reflects the change immediately
    try {
      await autoUpdateTableStatus(tableId);
    } catch (error) {
      console.error(
        `[OrderCreate] Failed to auto-update table status for table ${tableId}:`,
        error
      );
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        dailySeq: order.dailySeq ?? undefined,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        estimatedReadyTime: order.estimatedReadyTime,
      },
      message:
        'Order submitted successfully! Please pay at the counter when ready.',
    });
  } catch (error) {
    console.error('QR order creation error:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    // Handle known errors
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Handle unknown errors
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
