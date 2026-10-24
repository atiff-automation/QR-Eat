import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { RBACError } from '@/lib/rbac/types';
import { prisma } from '@/lib/database';

/**
 * GET /api/counter/payments/{idempotencyKey}
 *
 * Recover an uncertain payment result. Returns the stored response for the
 * key, scoped to the caller's restaurant.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'payments', 'read');

    const batch = await prisma.paymentBatch.findUnique({
      where: { idempotencyKey: key },
    });

    if (!batch) {
      return NextResponse.json(
        { success: false, error: 'Payment not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (
      !context!.isAdmin &&
      context!.restaurantId &&
      batch.restaurantId !== context!.restaurantId
    ) {
      return NextResponse.json(
        { success: false, error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      replayed: true,
      paymentBatchId: batch.id,
      receiptNumber: batch.receiptNumber,
      status: batch.status,
      response: batch.response,
    });
  } catch (error) {
    console.error('[CounterPaymentStatus] Error:', error);

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
      { success: false, error: 'Failed to load payment status' },
      { status: 500 }
    );
  }
}
