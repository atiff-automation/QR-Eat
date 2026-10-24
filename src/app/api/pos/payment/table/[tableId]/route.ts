import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  PaymentServiceError,
  processTablePaymentBatch,
} from '@/lib/services/payment-batch-service';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';

const TablePaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'ewallet']),
  cashReceived: z.number().positive().optional(),
  externalTransactionId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/pos/payment/table/[tableId]
 *
 * Canonical table payment:
 * - requires payments:write + table access;
 * - requires Idempotency-Key;
 * - rejects PENDING orders;
 * - sends all confirmed unpaid orders through one idempotent batch.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;

    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'payments', 'write');
    await requireTableAccess(tableId, context!);

    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Idempotency-Key header is required',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = TablePaymentSchema.parse(body);

    let restaurantId = context!.restaurantId;
    if (!restaurantId && context!.isAdmin) {
      const table = await prisma.table.findUnique({
        where: { id: tableId },
        select: { restaurantId: true },
      });
      restaurantId = table?.restaurantId;
    }

    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const result = await processTablePaymentBatch({
      tableId,
      restaurantId,
      userId: context!.userId,
      userType: context!.userType,
      idempotencyKey,
      paymentMethod: validatedData.paymentMethod,
      cashReceived: validatedData.cashReceived,
      externalTransactionId: validatedData.externalTransactionId,
      notes: validatedData.notes,
    });

    const response = result.response as {
      receiptNumber?: string;
      payments?: Array<{
        id: string;
        orderId: string;
        amount: string;
      }>;
    };

    if (!result.replayed && response.payments) {
      for (const payment of response.payments) {
        try {
          await PostgresEventManager.publishPaymentCompleted({
            orderId: payment.orderId,
            paymentId: payment.id,
            restaurantId,
            paymentMethod: validatedData.paymentMethod,
            amount: Number(payment.amount),
            receiptNumber: response.receiptNumber!,
            processedBy: context!.userId,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error('Failed to publish payment completed event:', error);
        }
      }
    }

    // Idempotent and safe to call after a replay too.
    try {
      await autoUpdateTableStatus(tableId);
    } catch (error) {
      console.error(
        '[TablePayment] Failed to auto-update table status:',
        error
      );
    }

    return NextResponse.json(
      { ...response, replayed: result.replayed },
      {
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
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

    if (error instanceof PaymentServiceError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    if (error instanceof RBACError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

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
        error:
          error instanceof Error ? error.message : 'Payment processing failed',
      },
      { status: 500 }
    );
  }
}
