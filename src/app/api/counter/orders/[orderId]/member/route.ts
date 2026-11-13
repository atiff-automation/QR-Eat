import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { RBACError } from '@/lib/rbac/types';
import { changeMember } from '@/lib/services/loyalty-bill-service';

const ChangeMemberSchema = z.object({
  phone: z.string().min(1).max(32),
  name: z.string().max(80).optional().nullable(),
  consent: z.boolean().optional(),
  consentVersion: z.string().max(100).optional().nullable(),
  consentTextHash: z.string().max(200).optional().nullable(),
  expectedBillRevision: z.number().int().nonnegative(),
});

/**
 * POST /api/counter/orders/{orderId}/member
 *
 * Attach or change the member of a takeaway order. Same rules as the dine-in
 * member route; the order is the bill identity.
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

    const data = ChangeMemberSchema.parse(await request.json());

    const result = await changeMember({
      restaurantId,
      target: { kind: 'order', orderId },
      userId: context!.userId,
      phone: data.phone,
      name: data.name,
      consent: data.consent,
      consentVersion: data.consentVersion,
      consentTextHash: data.consentTextHash,
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
  console.error('[CounterOrderMemberChange] Error');

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
    { success: false, error: 'Failed to change the member' },
    { status: 500 }
  );
}
