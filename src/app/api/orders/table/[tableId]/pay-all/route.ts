/**
 * Pay All Orders for a Table
 *
 * Processes payment for all pending orders at a table.
 * Updates all orders to 'PAID' status and table to 'AVAILABLE'.
 *
 * @route POST /api/orders/table/[tableId]/pay-all
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const PayAllSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'qr_payment']),
  amountPaid: z.number().positive(),
  notes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;
    const body = await request.json();

    // Validate inputs
    const validTableId = z.string().uuid().parse(tableId);
    const validatedData = PayAllSchema.parse(body);

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get all pending orders for this table
      const orders = await tx.order.findMany({
        where: {
          tableId: validTableId,
          status: 'PENDING',
        },
      });

      if (orders.length === 0) {
        throw new Error('No pending orders found for this table');
      }

      // Calculate total
      const totalAmount = orders.reduce(
        (sum, order) => sum + Number(order.totalAmount),
        0
      );

      // Verify amount paid matches total
      if (Math.abs(validatedData.amountPaid - totalAmount) > 0.01) {
        throw new Error(
          `Amount mismatch: Expected ${totalAmount}, received ${validatedData.amountPaid}`
        );
      }

      // Update all orders to confirmed and paid status
      const updatedOrders = await Promise.all(
        orders.map(async (order) => {
          // Update order status
          const updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'CONFIRMED',
              paymentStatus: 'PAID',
            },
          });

          // Create payment record
          await tx.payment.create({
            data: {
              orderId: order.id,
              paymentMethod: validatedData.paymentMethod,
              amount: order.totalAmount,
              processingFee: 0,
              netAmount: order.totalAmount,
              status: 'COMPLETED',
              processedAt: new Date(),
              completedAt: new Date(),
            },
          });

          return updatedOrder;
        })
      );

      // Update table status to available
      await tx.table.update({
        where: { id: validTableId },
        data: { status: 'AVAILABLE' },
      });

      // End all customer sessions for this table
      await tx.customerSession.updateMany({
        where: {
          tableId: validTableId,
          status: 'ACTIVE',
        },
        data: {
          status: 'ENDED',
          endedAt: new Date(),
        },
      });

      return {
        orders: updatedOrders,
        totalAmount,
        orderCount: orders.length,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Successfully processed payment for ${result.orderCount} orders`,
      ...result,
    });
  } catch (error) {
    console.error('Error processing table payment:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to process payment' },
      { status: 500 }
    );
  }
}
