import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import {
  PaymentServiceError,
  processOrderPaymentBatch,
} from '@/lib/services/payment-batch-service';

const OrderPaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'ewallet']),
  cashReceived: z.number().positive().optional(),
  externalTransactionId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/counter/orders/{orderId}/pay
 *
 * Counter-native payment for one takeaway order. Requires Idempotency-Key and
 * payments:write. Table payments remain on /api/counter/payments.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'payments', 'write');
    await requireOrderAccess(orderId, context!);

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

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

    const data = OrderPaymentSchema.parse(await request.json());

    const result = await processOrderPaymentBatch({
      orderId,
      restaurantId,
      userId: context!.userId,
      userType: context!.userType,
      idempotencyKey,
      paymentMethod: data.paymentMethod,
      cashReceived: data.cashReceived,
      externalTransactionId: data.externalTransactionId,
      notes: data.notes,
    });

    const response = result.response as {
      receiptNumber?: string;
      payments?: Array<{ id: string; orderId: string; amount: string }>;
    };

    if (!result.replayed && response.payments) {
      for (const payment of response.payments) {
        try {
          await PostgresEventManager.publishPaymentCompleted({
            orderId: payment.orderId,
            paymentId: payment.id,
            restaurantId,
            paymentMethod: data.paymentMethod,
            amount: Number(payment.amount),
            receiptNumber: response.receiptNumber!,
            processedBy: context!.userId,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error('Failed to publish order payment event:', error);
        }
      }
    }

    return NextResponse.json(
      { ...result.response, replayed: result.replayed },
      {
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    console.error('[CounterOrderPayment] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid payment data',
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
          { success: false, error: error.message, code: 'PERMISSION_DENIED' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to process the order payment' },
      { status: 500 }
    );
  }
}
