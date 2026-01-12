import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { calculateOrderTotals, estimateReadyTime } from '@/lib/order-utils';
import { SequenceManager } from '@/lib/sequence-manager';
import { CreateOrderRequest } from '@/types/order';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { getCustomerContext } from '@/lib/get-tenant-context';

export async function POST(request: NextRequest) {
  try {
    // Try to get customer context from headers (for subdomain-based access)
    // This is optional for QR code flow where restaurant context comes from table
    try {
      getCustomerContext(request);
    } catch {
      // Context validation not required for QR flow
      // Restaurant ID will be obtained from table instead
    }

    const body: CreateOrderRequest = await request.json();
    const { tableId, customerInfo, items, specialInstructions } = body;

    if (!tableId || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Table ID and items are required' },
        { status: 400 }
      );
    }

    // Verify table exists and get restaurant info (using customer's context)
    // Note: This query runs outside RLS context to verify table/restaurant
    // The actual order creation uses RLS
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

    // ✅ STRICT VALIDATION: Prevent ordering from a RESERVED table
    if (table.status === 'RESERVED') {
      return NextResponse.json(
        {
          error:
            'Table is reserved. Please ask staff to check you in before ordering.',
        },
        { status: 400 }
      );
    }

    // Calculate order totals
    const totals = calculateOrderTotals(
      items,
      parseFloat(table.restaurant.taxRate.toString()),
      parseFloat(table.restaurant.serviceChargeRate.toString())
    );

    // Generate sequential order number
    const { number: dailySeq, formatted: orderNumber } =
      await SequenceManager.getNextOrder(table.restaurant.id);

    // Create or get customer session
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

    const customerSession = await prisma.customerSession.create({
      data: {
        tableId,
        sessionToken,
        customerName: customerInfo?.name,
        customerPhone: customerInfo?.phone,
        customerEmail: customerInfo?.email,
        expiresAt,
        status: 'ACTIVE',
      },
    });

    // Estimate ready time
    const estimatedReadyTime = estimateReadyTime(items);

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber,
        dailySeq,
        restaurantId: table.restaurant.id,
        tableId,
        customerSessionId: customerSession.id,
        subtotalAmount: totals.subtotal,
        taxAmount: totals.taxAmount,
        serviceCharge: totals.serviceCharge,
        discountAmount: 0,
        totalAmount: totals.totalAmount,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        specialInstructions,
        estimatedReadyTime,
      },
    });

    // Create order items
    await Promise.all(
      items.map(async (item) => {
        const orderItem = await prisma.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalPrice,
            specialInstructions: item.specialInstructions,
            status: 'PENDING',
          },
        });

        // Create order item variations
        const variations = await Promise.all(
          item.selectedVariations.map((variation) =>
            prisma.orderItemVariation.create({
              data: {
                orderItemId: orderItem.id,
                variationId: variation.variationId,
                quantity: variation.quantity,
                unitPrice: variation.variation.priceModifier,
                totalAmount:
                  variation.variation.priceModifier * variation.quantity,
              },
            })
          )
        );

        return { ...orderItem, variations };
      })
    );

    // Update table status
    await prisma.table.update({
      where: { id: tableId },
      data: { status: 'OCCUPIED' },
    });

    // Publish PostgreSQL NOTIFY event for new order
    await PostgresEventManager.publishOrderCreated({
      orderId: order.id,
      restaurantId: table.restaurant.id,
      tableId: tableId,
      orderNumber: order.orderNumber,
      totalAmount: parseFloat(order.totalAmount.toString()),
      timestamp: Date.now(),
    });

    // Send kitchen notification for new order
    await PostgresEventManager.publishKitchenNotification({
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
        dailySeq: order.dailySeq ?? undefined,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        estimatedReadyTime: order.estimatedReadyTime,
        sessionToken: customerSession.sessionToken,
      },
    });
  } catch (error) {
    console.error('Order creation error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.json(
      {
        error: `Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}
