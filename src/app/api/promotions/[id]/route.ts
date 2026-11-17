/**
 * PATCH/DELETE /api/promotions/{id}
 *
 * Owner/manager promotion update and soft delete (§18.20.7). Both methods
 * require `promotions:manage` and an `Idempotency-Key`. PATCH rewrites the
 * scope join rows delete-then-insert under a promotion row lock; DELETE only
 * sets `deletedAt`/`isActive`, so historical `promotionSnapshot` reprints stay
 * readable.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import {
  deletePromotion,
  PromotionPatchSchema,
  updatePromotion,
} from '@/lib/services/loyalty-promotion-service';
import { handlePromotionRouteError } from '@/app/api/promotions/_lib/promotion-route-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'promotions', 'manage');

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
    await requireRestaurantAccess(restaurantId, context!);

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

    const patch = PromotionPatchSchema.parse(await request.json());
    const result = await updatePromotion({
      restaurantId,
      promotionId: id,
      userId: context!.userId,
      userType: context!.userType,
      patch,
      idempotencyKey,
    });

    return NextResponse.json(
      { success: true, promotion: result.promotion },
      {
        status: result.statusCode,
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    return handlePromotionRouteError(error, 'PATCH');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'promotions', 'manage');

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
    await requireRestaurantAccess(restaurantId, context!);

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

    const result = await deletePromotion({
      restaurantId,
      promotionId: id,
      userId: context!.userId,
      userType: context!.userType,
      idempotencyKey,
    });

    return NextResponse.json(
      { success: true, promotion: result.promotion },
      {
        status: result.statusCode,
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    return handlePromotionRouteError(error, 'DELETE');
  }
}
