import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { getTenantContext, requireAuth } from '@/lib/tenant-context';
import { Decimal } from '@prisma/client/runtime/library';
import { PAYMENT_STATUS, ORDER_WITH_DETAILS_INCLUDE } from '@/lib/order-utils';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { SequenceManager } from '@/lib/sequence-manager';

// Validation schema for table payment
const TablePaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'ewallet']),
  cashReceived: z.number().positive().optional(),
  externalTransactionId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/pos/payment/table/[tableId]
 * Process payment for all pending orders on a table
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;
    console.log('[Table Payment API] Request for table:', tableId);

    // Get tenant context and verify authentication
    const context = await getTenantContext(request);
    requireAuth(context);

    const { userId, userType, restaurantId } = context!;

    // Validate request body
    const body = await request.json();
    const validatedData = TablePaymentSchema.parse(body);

    // Find all eligible orders for this table
    // Eligible = PENDING payment status (any order status allowed for early payment)
    const eligibleOrders = await prisma.order.findMany({
      where: {
        tableId,
        restaurantId: restaurantId!,
        paymentStatus: PAYMENT_STATUS.PENDING,
        // Exclude cancelled orders from payment calculation
        status: { not: 'CANCELLED' },
      },
      include: ORDER_WITH_DETAILS_INCLUDE,
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log(
      `[Table Payment API] Found ${eligibleOrders.length} eligible orders`
    );

    if (eligibleOrders.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No eligible orders found for this table',
        },
        { status: 404 }
      );
    }

    // Calculate total amount
    const totalAmount = eligibleOrders.reduce(
      (sum, order) => sum.plus(new Decimal(order.totalAmount)),
      new Decimal(0)
    );

    console.log(`[Table Payment API] Total amount: ${totalAmount.toString()}`);

    // Validate cash sufficiency for cash payments
    let changeGiven: Decimal | null = null;
    if (validatedData.paymentMethod === 'cash' && validatedData.cashReceived) {
      const cashReceived = new Decimal(validatedData.cashReceived);
      if (cashReceived.lessThan(totalAmount)) {
        return NextResponse.json(
          {
            success: false,
            error: `Insufficient cash. Total: ${totalAmount}, Received: ${cashReceived}`,
          },
          { status: 400 }
        );
      }
      changeGiven = cashReceived.minus(totalAmount);
      console.log(
        `[Table Payment API] Cash: ${cashReceived}, Change: ${changeGiven.toString()}`
      );
    }

    // Generate sequential receipt number for this table payment
    const { number: dailySeq, formatted: receiptNumber } =
      await SequenceManager.getNextReceipt(restaurantId!);

    // Process all payments in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      const payments = [];

      for (let i = 0; i < eligibleOrders.length; i++) {
        const order = eligibleOrders[i];
        const isFirstOrder = i === 0;
        const orderAmount = new Decimal(order.totalAmount);

        // For FIRST order: store actual cash received and change
        // For OTHER orders: store just their individual amount
        const orderCashReceived =
          isFirstOrder && validatedData.cashReceived
            ? new Decimal(validatedData.cashReceived)
            : orderAmount;

        const orderChangeGiven =
          isFirstOrder && changeGiven ? changeGiven : new Decimal(0);

        // Build payment data
        const paymentData = {
          orderId: order.id,
          paymentMethod: validatedData.paymentMethod,
          amount: orderAmount,
          processingFee: new Decimal(0),
          netAmount: orderAmount,
          status: 'PAID' as const,
          processedBy: userId!,
          processedByType: userType!,
          cashReceived: orderCashReceived,
          changeGiven: orderChangeGiven,
          receiptNumber: `${receiptNumber}-${i + 1}`,
          dailySeq: dailySeq,
          externalTransactionId: validatedData.externalTransactionId,
          paymentMetadata: {
            tablePayment: true,
            primaryReceipt: receiptNumber,
            isFirstOrder,
            orderIndex: i + 1,
            totalOrders: eligibleOrders.length,
            notes: validatedData.notes,
          },
          processedAt: new Date(),
          completedAt: new Date(),
        };

        // Add user FK based on userType
        const finalPaymentData =
          userType === 'platform_admin'
            ? { ...paymentData, processedByAdminId: userId }
            : userType === 'restaurant_owner'
              ? { ...paymentData, processedByOwnerId: userId }
              : { ...paymentData, processedByStaffId: userId };

        // Create payment record
        const payment = await tx.payment.create({ data: finalPaymentData });

        // Update order payment status
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: PAYMENT_STATUS.PAID,
          },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            tableName: 'payments',
            recordId: payment.id,
            operation: 'CREATE',
            newValues: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              amount: orderAmount.toString(),
              receiptNumber,
              tablePayment: true,
            },
            changedBy: userId!,
            changedByType: userType!,
            ...(userType === 'platform_admin'
              ? { adminId: userId }
              : userType === 'restaurant_owner'
                ? { ownerId: userId }
                : { staffId: userId }),
          },
        });

        payments.push(payment);
      }

      return payments;
    });

    console.log(
      `[Table Payment API] Successfully processed ${result.length} payments`
    );

    // Publish payment events
    for (const payment of result) {
      const order = eligibleOrders.find((o) => o.id === payment.orderId);
      if (order) {
        PostgresEventManager.publishPaymentCompleted({
          orderId: order.id,
          paymentId: payment.id,
          restaurantId: restaurantId!,
          paymentMethod: validatedData.paymentMethod,
          amount: Number(order.totalAmount),
          receiptNumber,
          processedBy: userId!,
          timestamp: Date.now(),
        }).catch(console.error);
      }
    }

    // Update table status
    autoUpdateTableStatus(tableId).catch(console.error);

    // Create combined payment object for receipt display
    // This includes all orders and their items
    const combinedPayment = {
      ...result[0], // Base structure from first payment
      amount: totalAmount, // Combined total
      cashReceived: validatedData.cashReceived
        ? new Decimal(validatedData.cashReceived)
        : totalAmount,
      changeGiven: changeGiven || new Decimal(0),
      receiptNumber, // Primary receipt number
      order: {
        id: eligibleOrders[0].id, // Use first order ID as reference
        orderNumber: `TABLE-${eligibleOrders.length}-ORDERS`, // Indicate multiple orders
        tableId,
        createdAt: eligibleOrders[0].createdAt, // Use first order's creation time
        totalAmount,
        subtotalAmount: eligibleOrders.reduce(
          (sum, o) => sum.plus(new Decimal(o.subtotalAmount)),
          new Decimal(0)
        ),
        taxAmount: eligibleOrders.reduce(
          (sum, o) => sum.plus(new Decimal(o.taxAmount || 0)),
          new Decimal(0)
        ),
        serviceCharge: eligibleOrders.reduce(
          (sum, o) => sum.plus(new Decimal(o.serviceCharge || 0)),
          new Decimal(0)
        ),
        restaurant: {
          ...eligibleOrders[0].restaurant,
        },
        table: {
          id: tableId,
          tableNumber: eligibleOrders[0].table?.tableNumber || 0,
          tableName:
            eligibleOrders[0].table?.tableName ||
            `Table ${eligibleOrders[0].table?.tableNumber || ''}`,
          locationDescription: eligibleOrders[0].table?.locationDescription,
        },
        // Combine all items from all orders
        items: eligibleOrders.flatMap(
          (order) =>
            order.items?.map((item) => ({
              ...item,
              orderNumber: order.orderNumber, // Track which order each item came from
            })) || []
        ),
        // Add tax and service charge labels from restaurant settings
        taxLabel: eligibleOrders[0].restaurant.taxLabel || 'Tax',
        serviceChargeLabel:
          eligibleOrders[0].restaurant.serviceChargeLabel || 'Service Charge',
      },
    };

    console.log('[Table Payment API] Combined payment object:', {
      orderNumber: combinedPayment.order.orderNumber,
      itemsCount: combinedPayment.order.items?.length || 0,
      totalAmount: combinedPayment.order.totalAmount?.toString() || '0',
      items:
        combinedPayment.order.items?.map((i) => ({
          name: i.menuItem?.name || 'Unknown',
          quantity: i.quantity || 0,
          price: i.unitPrice?.toString() || '0',
        })) || [],
    });

    // Return success response
    return NextResponse.json({
      success: true,
      message: `Processed payment for ${result.length} orders`,
      receiptNumber,
      ordersProcessed: result.length,
      totalPaid: totalAmount.toString(),
      changeGiven: changeGiven?.toString() || '0',
      payment: combinedPayment, // Combined payment for receipt display
      payments: result.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        amount: p.amount.toString(),
        receiptNumber: p.receiptNumber,
      })),
    });
  } catch (error) {
    console.error('[Table Payment API] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Payment processing failed',
      },
      { status: 500 }
    );
  }
}
