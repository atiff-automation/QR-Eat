/**
 * GET/PATCH /api/settings/restaurant/loyalty
 *
 * Owner/manager loyalty configuration (§18.20.2, §18.20.7). PATCH requires
 * `loyalty:configure` and an `Idempotency-Key`; GET requires `settings:read`.
 * The endpoint works while the global `LOYALTY_ENABLED` flag is off so an owner
 * can configure loyalty before enabling it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
  LoyaltySettingsPatchSchema,
  LoyaltySettingsValidationError,
} from '@/lib/services/loyalty-settings-service';
import {
  OwnerIdempotencyMismatchError,
  OwnerMutationConflictError,
} from '@/lib/services/loyalty-owner-idempotency';

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings', 'read');

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

    const settings = await getLoyaltySettings(restaurantId);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return handleLoyaltySettingsError(error, 'GET');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'loyalty', 'configure');

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

    const patch = LoyaltySettingsPatchSchema.parse(await request.json());
    const result = await updateLoyaltySettings({
      restaurantId,
      userId: context!.userId,
      userType: context!.userType,
      patch,
      idempotencyKey,
    });

    return NextResponse.json(
      { success: true, settings: result.settings },
      {
        status: result.statusCode,
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    return handleLoyaltySettingsError(error, 'PATCH');
  }
}

function handleLoyaltySettingsError(
  error: unknown,
  method: 'GET' | 'PATCH'
): NextResponse {
  console.error(`[LoyaltySettings] ${method} failed`);

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid loyalty settings',
        code: 'INVALID_REQUEST',
        details: error.issues.map((issue) => issue.message),
      },
      { status: 400 }
    );
  }

  if (error instanceof LoyaltySettingsValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof OwnerIdempotencyMismatchError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof OwnerMutationConflictError) {
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
        {
          success: false,
          error:
            method === 'PATCH'
              ? 'You do not have permission to change loyalty settings'
              : 'You do not have permission to view loyalty settings',
          code: 'PERMISSION_DENIED',
        },
        { status: 403 }
      );
    }
  }

  return NextResponse.json(
    {
      success: false,
      error:
        method === 'PATCH'
          ? 'Failed to update loyalty settings'
          : 'Failed to read loyalty settings',
    },
    { status: 500 }
  );
}
