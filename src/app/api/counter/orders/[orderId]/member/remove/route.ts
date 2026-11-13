import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { RBACError } from '@/lib/rbac/types';
import { removeMember } from '@/lib/services/loyalty-bill-service';

const RemoveMemberSchema = z.object({
  expectedBillRevision: z.number().int().nonnegative(),
});

/**
 * POST /api/counter/orders/{orderId}/member/remove
 *
 * Clear the member of a takeaway order. The order becomes a guest bill.
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
    requirePermission(context!, 'loyalty', 'attach');
    requirePermission(context!, 'orders', 'write');

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

    const data = RemoveMemberSchema.parse(await request.json());

    const result = await removeMember({
      restaurantId,
      target: { kind: 'order', orderId },
      userId: context!.userId,
      expectedBillRevision: data.expectedBillRevision,
      idempotencyKey,
    });

    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
    });
  } catch (error) {
    return handleMemberRouteError(error);
  }
}

function handleMemberRouteError(error: unknown): NextResponse {
  console.error('[CounterOrderMemberRemove] Error');

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid member data',
        code: 'INVALID_REQUEST',
        details: error.issues.map((issue) => issue.message),
      },
      { status: 400 }
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
    { success: false, error: 'Failed to remove the member' },
    { status: 500 }
  );
}
