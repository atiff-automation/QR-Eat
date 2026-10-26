import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  CounterOrderInputSchema,
  CounterOrderError,
  quoteCounterOrder,
} from '@/lib/services/counter-order-service';

/**
 * POST /api/counter/orders/quote
 *
 * Server-authoritative price and availability preview for Counter order entry.
 * No order or session is written.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'write');

    const input = CounterOrderInputSchema.parse(await request.json());
    if (input.orderType === 'DINE_IN') {
      await requireTableAccess(input.tableId!, context!);
    }

    const quote = await quoteCounterOrder(input, {
      userId: context!.userId,
      userType: context!.userType,
      isAdmin: context!.isAdmin,
      restaurantId: context!.restaurantId,
    });

    return NextResponse.json({ success: true, quote });
  } catch (error) {
    console.error('[CounterOrderQuote] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid order data',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    if (error instanceof CounterOrderError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          issues: error.issues,
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
          { success: false, error: error.message },
          { status: 403 }
        );
      }
    }
    return NextResponse.json(
      { success: false, error: 'Failed to price the Counter order' },
      { status: 500 }
    );
  }
}
