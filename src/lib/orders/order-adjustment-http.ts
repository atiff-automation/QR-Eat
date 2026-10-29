import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { CancelOrderSchema } from '@/lib/validation/order-modification-schemas';
import {
  cancelOrderAdjustment,
  orderAdjustmentErrorResponse,
  refundOrderAdjustment,
  voidOrderAdjustment,
} from '@/lib/orders/order-adjustment-service';
import type { OrderAdjustmentAction } from '@/lib/orders/order-adjustment-policy';

type AdjustmentKind = Exclude<OrderAdjustmentAction, 'NONE'>;

const ACTIONS = {
  CANCEL: cancelOrderAdjustment,
  VOID: voidOrderAdjustment,
  REFUND: refundOrderAdjustment,
} satisfies Record<
  AdjustmentKind,
  (
    restaurantId: string,
    orderId: string,
    actor: Parameters<typeof cancelOrderAdjustment>[2],
    input: Parameters<typeof cancelOrderAdjustment>[3]
  ) => Promise<unknown>
>;

export async function handleOrderAdjustmentRequest(
  request: NextRequest,
  paramsPromise: Promise<{ id: string }>,
  kind: AdjustmentKind,
  permission: { resource: string; action: string }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, permission.resource, permission.action);

    const { id: orderId } = await paramsPromise;
    await requireOrderAccess(orderId, context!);

    const body = await request.json();
    const data = CancelOrderSchema.parse(body);
    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const result = await ACTIONS[kind](
      restaurantId,
      orderId,
      {
        userId: context!.userId,
        userType: context!.userType,
        roleTemplate: context!.roleTemplate,
        permissions: context!.permissions,
        isAdmin: context!.isAdmin,
      },
      data
    );

    return NextResponse.json({
      success: true,
      ...result,
      isDuplicate: result.replayed,
      refundMessage: result.message,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    const mapped = orderAdjustmentErrorResponse(error);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    if (error instanceof RBACError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    console.error('Order adjustment failed:', error);
    return NextResponse.json(
      { error: 'Failed to adjust order' },
      { status: 500 }
    );
  }
}
