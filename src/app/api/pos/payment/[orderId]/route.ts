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
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    // Get tenant context and verify authentication
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'payments', 'write');

    const { orderId } = await params;

    // Validate request body
    const body = await request.json();
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
    if (order.paymentStatus === PAYMENT_STATUS.COMPLETED) {
      return NextResponse.json(
        { success: false, error: 'Order already paid' },
        { status: 400 }
      );
    }

    // Calculate change for cash payments
    let changeGiven: Decimal | null = null;
    if (validatedData.paymentMethod === 'cash' && validatedData.cashReceived) {
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

    // Generate unique receipt number
    const receiptNumber = generateReceiptNumber();

    // Determine specific FK field based on user type
    const userType = context!.userType;
    const userId = context!.userId!;
    const paymentData: Record<string, unknown> = {
      orderId: order.id,
      paymentMethod: validatedData.paymentMethod,
      amount: order.totalAmount,
      processingFee: new Decimal(0),
      netAmount: order.totalAmount,
      status: PAYMENT_STATUS.COMPLETED,
      processedBy: userId,
      processedByType: userType,
      cashReceived: validatedData.cashReceived
        ? new Decimal(validatedData.cashReceived)
        : null,
      changeGiven,
      receiptNumber,
      externalTransactionId: validatedData.externalTransactionId,
      paymentMetadata: validatedData.notes
        ? { notes: validatedData.notes }
        : {},
      processedAt: new Date(),
      completedAt: new Date(),
    };

    // Set the appropriate FK field based on user type
    if (userType === 'platform_admin') {
      paymentData.processedByAdminId = userId;
    } else if (userType === 'restaurant_owner') {
      paymentData.processedByOwnerId = userId;
    } else if (userType === 'staff') {
      paymentData.processedByStaffId = userId;
    }

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
          paymentStatus: PAYMENT_STATUS.COMPLETED,
          status: ORDER_STATUS.SERVED, // Mark order as served when paid
          servedAt: new Date(), // Set served timestamp
          servedBy: userId, // Track who processed the payment
        },
      });

      // Create audit log with proper user type tracking
      const auditData: Record<string, unknown> = {
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

      // Set the appropriate audit trail FK based on user type
      if (userType === 'platform_admin') {
        auditData.adminId = userId;
      } else if (userType === 'restaurant_owner') {
        auditData.ownerId = userId;
      } else if (userType === 'staff') {
        auditData.staffId = userId;
      }

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
      { success: false, error: 'Failed to process payment' },
      { status: 500 }
    );
  }
}
