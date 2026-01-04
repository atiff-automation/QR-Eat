/**
 * POS API - Process Payment
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Error Handling
 * - RBAC Integration
 * - Transaction Safety
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { PAYMENT_STATUS, ORDER_STATUS } from '@/lib/order-utils';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { generateReceiptNumber } from '@/lib/utils/receipt-formatter';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';

// Validation schema
const PaymentRequestSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'ewallet']),
  cashReceived: z.number().positive().optional(),
  externalTransactionId: z.string().optional(),
  notes: z.string().optional(),
  payFullTable: z.boolean().optional(),
  paymentMetadata: z.record(z.any()).optional(), // Allow metadata for early payment tracking
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    console.log('[API] Payment Request Received for order:', await params);

    // Get tenant context and verify authentication
    const context = await getTenantContext(request);
    console.log('[API] Auth Context:', {
      userId: context?.userId,
      role: context?.userType,
    });
    requireAuth(context);
    requirePermission(context!, 'payments', 'write');

    const userId = context!.userId!;
    const userType = context!.userType!;

    const { orderId } = await params;

    // Validate request body
    const body = await request.json();
    console.log('[API] Request Body:', body);
    const validatedData = PaymentRequestSchema.parse(body);

    // Verify order exists and belongs to restaurant
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId: context!.restaurantId!,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check if already paid
    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      return NextResponse.json(
        { success: false, error: 'Order already paid' },
        { status: 400 }
      );
    }

    // Check if order is ready for payment (hybrid policy)
    if (!['READY', 'SERVED'].includes(order.status)) {
      // Allow early payment but log warning
      console.warn(
        `[Payment] Early payment for order ${order.id} with status ${order.status}`
      );
      console.log('🚨 EARLY PAYMENT DETECTED 🚨', {
        orderId: order.id,
        orderStatus: order.status,
        earlyPayment: true,
      });

      // Track early payments in metadata
      validatedData.paymentMetadata = {
        ...validatedData.paymentMetadata,
        earlyPayment: true,
        paidAtStatus: order.status,
      };
    }

    // Check if table payment is requested
    if (validatedData.payFullTable) {
      // Find all eligible orders for the table
      // Strict Filter: Status is READY or SERVED, and Payment matches PENDING
      const eligibleOrders = await prisma.order.findMany({
        where: {
          tableId: order.tableId,
          restaurantId: context!.restaurantId!,
          paymentStatus: { in: [PAYMENT_STATUS.PENDING, 'PENDING'] }, // Handle both enum and string just in case
          status: {
            in: [ORDER_STATUS.READY, ORDER_STATUS.SERVED, 'READY', 'SERVED'],
          },
        },
      });

      console.log(
        `[API] Found ${eligibleOrders.length} eligible orders for table payment`
      );

      if (eligibleOrders.length === 0) {
        // Fallback or error? If we are here, at least 'order' should be eligible unless it status mismatch
        // But 'order' was fetched by ID above. Let's include 'order' in the check logic.
      }

      // Calculate total for eligible orders
      const totalAmount = eligibleOrders.reduce(
        (sum, o) => sum.plus(new Decimal(o.totalAmount)),
        new Decimal(0)
      );

      // Validate cash sufficiency
      let changeGiven: Decimal | null = null;
      if (
        validatedData.paymentMethod === 'cash' &&
        validatedData.cashReceived
      ) {
        const cashReceived = new Decimal(validatedData.cashReceived);
        if (cashReceived.lessThan(totalAmount)) {
          return NextResponse.json(
            {
              success: false,
              error: 'Insufficient cash received for table total',
            },
            { status: 400 }
          );
        }
        changeGiven = cashReceived.minus(totalAmount);
      }

      // Generate receipt number
      const receiptNumber = generateReceiptNumber();
      console.log(`[API] Generated Receipt Number: ${receiptNumber}`);

      // Process ALL payments in a single transaction
      console.log('[API] Starting transaction for table payment...');
      const result = await prisma.$transaction(async (tx) => {
        const results = [];

        // We need to distribute cash received across orders for record keeping?
        // Or just assign it to the first/primary and 0 for others?
        // Better: Pro-rate or just repeat the metadata?
        // For simplicity: We will record the full cash received on the PRIMARY order payment
        // and just the specific amount on others to avoid inflating numbers?
        // Actually, the schema allows 1 payment per order.
        // Let's split the cash/change logically or just attach receipt info to all.

        for (const currentOrder of eligibleOrders) {
          // Build payment data for this specific order
          const orderAmount = new Decimal(currentOrder.totalAmount);

          const paymentData = {
            orderId: currentOrder.id,
            paymentMethod: validatedData.paymentMethod,
            amount: orderAmount,
            processingFee: new Decimal(0),
            netAmount: orderAmount,
            status: 'PAID' as const,
            processedBy: context!.userId!,
            processedByType: context!.userType!,
            // Only record specific cash info if needed, but for 'Cash Received',
            // we can store the full amount on the primary order, or just store the 'amount paid'
            // equal to order total for data consistency.
            cashReceived: orderAmount, // We treat it as if they paid exact amount for this order part
            changeGiven: new Decimal(0), // Change is handled in the physical world, data-wise we cleared the debt
            // FIX: receiptNumber must be unique per payment record. Append index to make it unique for multi-order table payment.
            receiptNumber: `${receiptNumber}-${eligibleOrders.indexOf(currentOrder) + 1}`,
            externalTransactionId: validatedData.externalTransactionId,
            paymentMetadata: validatedData.notes
              ? {
                notes: validatedData.notes,
                groupedPayment: true,
                primaryReceipt: receiptNumber,
              }
              : { groupedPayment: true, primaryReceipt: receiptNumber },
            processedAt: new Date(),
            completedAt: new Date(),
          };
          // Add FK
          const finalPaymentData =
            userType === 'platform_admin'
              ? { ...paymentData, processedByAdminId: userId }
              : userType === 'restaurant_owner'
                ? { ...paymentData, processedByOwnerId: userId }
                : { ...paymentData, processedByStaffId: userId };

          const payment = await tx.payment.create({ data: finalPaymentData });

          const updatedOrder = await tx.order.update({
            where: { id: currentOrder.id },
            data: {
              paymentStatus: PAYMENT_STATUS.PAID,
              // DO NOT change order status - payment is independent of order workflow
              // Order status should only be changed by kitchen/staff workflow
            },
          });

          // Audit Log
          const auditData = {
            tableName: 'payments',
            recordId: payment.id,
            operation: 'CREATE',
            newValues: {
              orderId: currentOrder.id,
              orderNumber: currentOrder.orderNumber,
              amount: currentOrder.totalAmount.toString(),
              receiptNumber,
              processedBy: context!.userId!,
              processedByType: context!.userType!,
            },
            changedBy: context!.userId!,
            changedByType: context!.userType!,
            // Add correct FKs...
            ...(userType === 'platform_admin'
              ? { adminId: userId }
              : userType === 'restaurant_owner'
                ? { ownerId: userId }
                : { staffId: userId }),
          };
          await tx.auditLog.create({ data: auditData });

          results.push({ payment, updatedOrder });
        }
        return results;
      });

      // Post-transaction updates (Events & Table Status)
      for (const res of result) {
        PostgresEventManager.publishPaymentCompleted({
          orderId: res.updatedOrder.id,
          paymentId: res.payment.id,
          restaurantId: order.restaurantId,
          paymentMethod: validatedData.paymentMethod,
          amount: Number(res.updatedOrder.totalAmount),
          receiptNumber,
          processedBy: context!.userId!,
          timestamp: Date.now(),
        }).catch(console.error);
      }

      // Update table status once
      autoUpdateTableStatus(order.tableId).catch(console.error);

      return NextResponse.json({
        success: true,
        message: `Processed payment for ${result.length} orders`,
        receiptNumber,
        totalPaid: totalAmount,
        changeGiven,
      });
    } else {
      // --- EXISTING SINGLE ORDER LOGIC ---
      // Verify only ONE order payment

      // Calculate change for cash payments
      let changeGiven: Decimal | null = null;
      if (
        validatedData.paymentMethod === 'cash' &&
        validatedData.cashReceived
      ) {
        const cashReceived = new Decimal(validatedData.cashReceived);
        const totalAmount = new Decimal(order.totalAmount);

        if (cashReceived.lessThan(totalAmount)) {
          return NextResponse.json(
            { success: false, error: 'Insufficient cash received' },
            { status: 400 }
          );
        }

        changeGiven = cashReceived.minus(totalAmount);
      }

      // Generate receipt number
      const receiptNumber = generateReceiptNumber();
      console.log(`[API] Generated Receipt Number: ${receiptNumber}`);

      const basePaymentData = {
        orderId: order.id,
        paymentMethod: validatedData.paymentMethod,
        amount: new Decimal(order.totalAmount),
        processingFee: new Decimal(0),
        netAmount: new Decimal(order.totalAmount),
        status: 'PAID' as const,
        processedBy: userId,
        processedByType: userType,
        cashReceived: validatedData.cashReceived
          ? new Decimal(validatedData.cashReceived)
          : new Decimal(order.totalAmount),
        changeGiven: changeGiven ?? new Decimal(0),
        receiptNumber,
        externalTransactionId: validatedData.externalTransactionId,
        paymentMetadata: validatedData.paymentMetadata || undefined,
        processedAt: new Date(),
        completedAt: new Date(),
      };

      // Create type-safe payment data with appropriate FK based on user type
      const paymentData =
        userType === 'platform_admin'
          ? { ...basePaymentData, processedByAdminId: userId }
          : userType === 'restaurant_owner'
            ? { ...basePaymentData, processedByOwnerId: userId }
            : { ...basePaymentData, processedByStaffId: userId };

      // Process payment in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create payment record
        const payment = await tx.payment.create({
          data: paymentData,
        });

        // Update order payment status AND order status
        // When payment is completed, the order is considered served
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: PAYMENT_STATUS.PAID,
            // DO NOT change order status - payment is independent of order workflow
            // Order status should only be changed by kitchen/staff workflow
          },
        });
        console.log('[API] Transaction: Order Updated', {
          id: updatedOrder.id,
          paymentStatus: updatedOrder.paymentStatus,
          status: updatedOrder.status,
        });

        // Create audit log with proper user type tracking
        const baseAuditData = {
          tableName: 'payments',
          recordId: payment.id,
          operation: 'CREATE',
          newValues: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentMethod: validatedData.paymentMethod,
            amount: order.totalAmount.toString(),
            receiptNumber,
            processedBy: userId,
            processedByType: userType,
          },
          changedBy: userId,
          changedByType: userType,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        };

        // Create type-safe audit data with appropriate FK based on user type
        const auditData =
          userType === 'platform_admin'
            ? { ...baseAuditData, adminId: userId }
            : userType === 'restaurant_owner'
              ? { ...baseAuditData, ownerId: userId }
              : { ...baseAuditData, staffId: userId };

        await tx.auditLog.create({
          data: auditData,
        });

        return { payment, updatedOrder };
      });

      // Publish payment completed event (fire and forget)
      PostgresEventManager.publishPaymentCompleted({
        orderId: order.id,
        paymentId: result.payment.id,
        restaurantId: order.restaurantId,
        paymentMethod: validatedData.paymentMethod,
        amount: Number(order.totalAmount),
        receiptNumber,
        processedBy: context!.userId!,
        timestamp: Date.now(),
      }).catch((error) => {
        console.error('Failed to publish payment completed event:', error);
      });

      // Auto-update table status after payment completion
      // This will clear the table to "available" if all orders are served
      autoUpdateTableStatus(order.tableId).catch((error) => {
        console.error('[Payment] Failed to auto-update table status:', error);
      });

      return NextResponse.json({
        success: true,
        payment: result.payment,
        order: {
          id: result.updatedOrder.id,
          paymentStatus: result.updatedOrder.paymentStatus,
          updatedAt: result.updatedOrder.updatedAt,
        },
        message: 'Payment processed successfully',
      });
    }
  } catch (error) {
    console.error('Payment processing error:', error);

    // Handle Zod validation errors
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
      {
        success: false,
        error: 'Failed to process payment',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
