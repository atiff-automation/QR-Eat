/**
 * POST /api/counter/offline/orders
 *
 * Creates the canonical server order for an order the Counter created and
 * printed while offline. Idempotent by `clientOrderId` and the request
 * `Idempotency-Key`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  CounterOrderError,
  type CounterOrderActor,
} from '@/lib/services/counter-order-service';
import {
  OfflineOrderInputSchema,
  syncOfflineOrder,
} from '@/lib/services/offline-order-sync-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'write');

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

    const input = OfflineOrderInputSchema.parse(await request.json());
    if (input.orderType === 'DINE_IN') {
      await requireTableAccess(input.tableId!, context!);
    }

    const actor: CounterOrderActor = {
      userId: context!.userId,
      userType: context!.userType,
      isAdmin: context!.isAdmin,
      restaurantId,
    };

    const result = await syncOfflineOrder(input, actor, idempotencyKey);

    return NextResponse.json(
      { success: true, ...result },
      { status: result.replayed ? 200 : 201 }
    );
  } catch (error) {
    console.error('[OfflineOrderSync] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid offline order',
          code: 'VALIDATION_FAILED',
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'This offline order was already synced. Refresh and retry.',
          code: 'CLIENT_ORDER_RACE',
        },
        { status: 409 }
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
      { success: false, error: 'Failed to sync the offline order' },
      { status: 500 }
    );
  }
}
