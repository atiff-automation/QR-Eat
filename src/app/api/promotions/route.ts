/**
 * GET/POST /api/promotions
 *
 * Owner/manager promotion list and creation (§18.20.7). All three scopes are
 * supported; scope membership is stored in the join tables. POST requires
 * `promotions:manage` and an `Idempotency-Key`; the audit row is written in the
 * same transaction as the promotion.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import {
  createPromotion,
  listPromotions,
  PromotionInputSchema,
  PromotionListFiltersSchema,
} from '@/lib/services/loyalty-promotion-service';
import { handlePromotionRouteError } from '@/app/api/promotions/_lib/promotion-route-error';

export async function GET(request: NextRequest) {
  try {
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

    const filters = PromotionListFiltersSchema.parse({
      scope: request.nextUrl.searchParams.get('scope') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    });
    const promotions = await listPromotions({ restaurantId, filters });
    return NextResponse.json({ success: true, promotions });
  } catch (error) {
    return handlePromotionRouteError(error, 'GET');
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const input = PromotionInputSchema.parse(await request.json());
    const result = await createPromotion({
      restaurantId,
      userId: context!.userId,
      userType: context!.userType,
      input,
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
    return handlePromotionRouteError(error, 'POST');
  }
}
