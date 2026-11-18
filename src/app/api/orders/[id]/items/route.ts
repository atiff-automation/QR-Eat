import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { trustedIp } from '@/lib/client-ip';
import { AddOrderItemsSchema } from '@/lib/validation/order-modification-schemas';
import {
  addOrderItems,
  OrderAddItemsError,
} from '@/lib/orders/order-add-items-service';

/**
 * POST /api/orders/{orderId}/items
 *
 * Back-office/POS add-items mutation (`phase-b-counter-feed-v1`). The server
 * prices the lines, owns totals/version/idempotency, and writes the add-on
 * ticket, change row and audit row in one transaction. No web UI in B3-S.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'write');

    const { id: orderId } = await params;

    try {
      await requireOrderAccess(orderId, context!);
    } catch (error) {
      // Cross-tenant (403), missing (404) and platform-admin rejection all look
      // like a missing order, so a tenant cannot probe another's ids.
      if (
        error instanceof RBACError &&
        (error.statusCode === 403 || error.statusCode === 404)
      ) {
        return NextResponse.json(
          { success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' },
          { status: 404 }
        );
      }
      throw error;
    }

    const body = await request.json().catch(() => null);
    const parsed = AddOrderItemsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid input',
          code: 'VALIDATION_FAILED',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Restaurant context is required',
          code: 'RESTAURANT_CONTEXT_REQUIRED',
        },
        { status: 400 }
      );
    }

    const result = await addOrderItems(
      restaurantId,
      orderId,
      {
        userId: context!.userId,
        userType: context!.userType,
        ipAddress: trustedIp(request),
        userAgent: request.headers.get('user-agent'),
      },
      parsed.data
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof OrderAddItemsError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
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
          {
            success: false,
            error: error.message,
            code: 'PERMISSION_DENIED',
          },
          { status: 403 }
        );
      }
    }

    console.error('[OrderAddItems] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add order items' },
      { status: 500 }
    );
  }
}
