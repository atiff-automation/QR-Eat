import { NextRequest, NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { RBACError } from '@/lib/rbac/types';
import {
  BILL_ORDER_SELECT,
  projectBill,
} from '@/lib/services/loyalty-bill-service';

/**
 * GET /api/counter/orders/{orderId}/bill
 *
 * Takeaway bill read. Returns the same §18.20.6 fields as the dine-in bill:
 * `billRevision` is `Order.discountVersion`, service charge comes from the
 * order snapshot (0 for takeaway), and the loyalty fields are omitted when
 * loyalty is inactive so pre-loyalty Counter builds are unaffected.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: {
        ...BILL_ORDER_SELECT,
        orderNumber: true,
        discountVersion: true,
        customerId: true,
        diningSessionId: true,
        orderType: true,
        taxAmount: true,
        serviceCharge: true,
        discountAmount: true,
        totalAmount: true,
        createdAt: true,
        servedAt: true,
        restaurant: {
          select: {
            currency: true,
            taxLabel: true,
            serviceChargeLabel: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (order.orderType !== 'TAKEAWAY') {
      return NextResponse.json(
        {
          success: false,
          error: 'This bill endpoint is for takeaway orders',
          code: 'INVALID_ORDER_TYPE',
        },
        { status: 400 }
      );
    }

    const projection = await safeProjectBill({
      restaurantId,
      orders: [order],
      customerId: order.customerId,
      billRevision: order.discountVersion,
    });

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotalAmount: new Decimal(order.subtotalAmount).toFixed(2),
        taxAmount: new Decimal(order.taxAmount).toFixed(2),
        serviceCharge: new Decimal(order.serviceCharge).toFixed(2),
        discountAmount: new Decimal(order.discountAmount).toFixed(2),
        totalAmount: new Decimal(order.totalAmount).toFixed(2),
        createdAt: order.createdAt.toISOString(),
        servedAt: order.servedAt?.toISOString() ?? null,
      },
      currency: order.restaurant.currency,
      taxLabel: order.restaurant.taxLabel || 'Tax',
      serviceChargeLabel:
        order.restaurant.serviceChargeLabel || 'Service Charge',
      ...(projection ?? {}),
    });
  } catch (error) {
    console.error('[CounterOrderBill] Error');

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
      { success: false, error: 'Failed to load the order bill' },
      { status: 500 }
    );
  }
}

async function safeProjectBill(
  input: Parameters<typeof projectBill>[0]
): Promise<Awaited<ReturnType<typeof projectBill>>> {
  try {
    return await projectBill(input);
  } catch {
    console.error('[CounterOrderBill] loyalty projection failed');
    return null;
  }
}
