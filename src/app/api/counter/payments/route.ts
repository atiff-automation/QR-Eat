import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  PaymentServiceError,
  processTablePaymentBatch,
} from '@/lib/services/payment-batch-service';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';

const MoneyInput = z.union([
  z.number().finite(),
  z.string().regex(/^\d+(\.\d{1,2})?$/, 'Expected a money value'),
]);

const NonNegativeMoneyInput = z.union([
  z.number().nonnegative(),
  z.string().regex(/^\d+(\.\d{1,2})?$/, 'Expected a money value'),
]);

const CounterPaymentSchema = z
  .object({
    tableId: z.string().uuid(),
    orderIds: z.array(z.string().uuid()).optional(),
    /** Existing field name; `method` is the §18.20.15 C alias. */
    paymentMethod: z.enum(['cash', 'card', 'ewallet']).optional(),
    method: z.enum(['cash', 'card', 'ewallet']).optional(),
    cashReceived: NonNegativeMoneyInput.optional(),
    expectedTotal: MoneyInput.optional(),
    expectedCashPayable: MoneyInput.optional(),
    expectedBillRevision: z.number().int().nonnegative().optional(),
    externalTransactionId: z.string().optional(),
    notes: z.string().optional(),
    recordedOffline: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (!value.paymentMethod && !value.method) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentMethod'],
        message: 'A payment method is required',
      });
    }
    if (
      value.paymentMethod &&
      value.method &&
      value.paymentMethod !== value.method
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['method'],
        message: 'method and paymentMethod disagree',
      });
    }
  });

/**
 * POST /api/counter/payments
 *
 * Counter-native table payment. Requires Idempotency-Key and
 * payments:write. The response is replayed for the same key + body.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'payments', 'write');

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
    const data = CounterPaymentSchema.parse(body);

    await requireTableAccess(data.tableId, context!);

    let restaurantId = context!.restaurantId;
    if (!restaurantId && context!.isAdmin) {
      const table = await prisma.table.findUnique({
        where: { id: data.tableId },
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

    const paymentMethod = data.method ?? data.paymentMethod!;

    const result = await processTablePaymentBatch({
      tableId: data.tableId,
      restaurantId,
      userId: context!.userId,
      userType: context!.userType,
      idempotencyKey,
      paymentMethod,
      cashReceived: data.cashReceived,
      expectedTotal: data.expectedTotal,
      expectedCashPayable: data.expectedCashPayable,
      expectedBillRevision: data.expectedBillRevision,
      externalTransactionId: data.externalTransactionId,
      notes: data.notes,
      recordedOffline: data.recordedOffline,
      orderIds: data.orderIds,
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
            paymentMethod: paymentMethod,
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

    try {
      await autoUpdateTableStatus(data.tableId);
    } catch (error) {
      console.error(
        '[CounterPayment] Failed to auto-update table status:',
        error
      );
    }

    await AuditLogger.logSecurityEvent(
      context!.userId,
      result.replayed ? 'PAYMENT_BATCH_REPLAYED' : 'PAYMENT_BATCH_COMPLETED',
      'high',
      result.replayed
        ? `Payment batch ${response.receiptNumber || idempotencyKey} replayed`
        : `Payment batch ${response.receiptNumber || idempotencyKey} completed`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          receiptNumber: response.receiptNumber,
          tableId: data.tableId,
          paymentMethod: paymentMethod,
          idempotencyKey,
          replayed: result.replayed,
          paymentCount: response.payments?.length || 0,
        },
      }
    );

    return NextResponse.json(
      { ...result.response, replayed: result.replayed },
      {
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    console.error('[CounterPayment] Error:', error);

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
      { success: false, error: 'Payment processing failed' },
      { status: 500 }
    );
  }
}
