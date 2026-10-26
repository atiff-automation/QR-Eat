import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  OrderDispatchError,
  confirmPendingOrder,
} from '@/lib/services/order-dispatch-service';

/**
 * POST /api/counter/orders/{orderId}/send
 *
 * Retry a Counter order that was saved while the kitchen station was offline.
 * This is intentionally separate from the general QR confirmation route:
 * cashiers may retry Counter orders they created, but only owners/managers may
 * use the station override.
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
    requirePermission(context!, 'orders', 'write');
    await requireOrderAccess(orderId, context!);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        source: true,
        status: true,
        takenBy: true,
        restaurantId: true,
      },
    });
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' },
        { status: 404 }
      );
    }
    if (order.source !== 'COUNTER') {
      return NextResponse.json(
        {
          success: false,
          error: 'Only Counter orders can be sent through this endpoint',
          code: 'ORDER_SOURCE_INVALID',
        },
        { status: 409 }
      );
    }

    const isOwnerOrManager =
      context!.userType === 'restaurant_owner' ||
      (context!.userType === 'staff' && context!.roleTemplate === 'manager');
    if (!isOwnerOrManager && order.takenBy !== context!.userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only the staff member who created this order can retry it.',
          code: 'ORDER_SEND_NOT_ALLOWED',
        },
        { status: 403 }
      );
    }

    if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
      return NextResponse.json(
        {
          success: false,
          error: `Order cannot be sent from ${order.status}`,
          code: 'ORDER_NOT_SENDABLE',
        },
        { status: 409 }
      );
    }

    const overrideStation =
      request.headers.get('x-station-override') === 'true' && isOwnerOrManager;

    const result = await confirmPendingOrder({
      orderId,
      actor: {
        userId: context!.userId,
        userType: context!.userType,
        isAdmin: context!.isAdmin,
      },
      overrideStation,
      ipAddress:
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown',
    });

    return NextResponse.json({
      success: true,
      order: result.order,
      ticket: result.ticket,
      warning: null,
      replayed: result.replayed,
    });
  } catch (error) {
    console.error('[CounterOrderSend] Error:', error);

    if (error instanceof OrderDispatchError) {
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
      { success: false, error: 'Failed to send the Counter order' },
      { status: 500 }
    );
  }
}
