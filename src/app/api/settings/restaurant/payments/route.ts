/**
 * Restaurant Settings API - Payment Settings
 *
 * `GET`/`PUT /api/settings/restaurant/payments`.
 *
 * Adds the `cashRounding` policy (`NONE`/`NEAREST_5_SEN`, §18.20.14 H) to the
 * existing payment-method settings. Rounding is independent of
 * `loyalty.enabled`. `businessDayCloseTime` stays owned by `Restaurant` and is
 * returned here for the settings screen; it is not duplicated in loyalty
 * settings.
 *
 * PUT accepts an optional `Idempotency-Key` (§18.20.7). When present the
 * request is replay-safe; when absent the legacy behaviour is unchanged so
 * existing dashboard clients keep working. Every update writes an audit row in
 * the same transaction as the restaurant update.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, type TransactionClient } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { PaymentMethodsSchema } from '@/lib/validation/settings-schemas';
import {
  OwnerIdempotencyMismatchError,
  OwnerMutationConflictError,
  runIdempotentOwnerMutation,
  stableRequestHash,
} from '@/lib/services/loyalty-owner-idempotency';

const CashRoundingSchema = z.enum(['NONE', 'NEAREST_5_SEN']);

const PaymentSettingsUpdateSchema = z
  .object({
    paymentMethods: PaymentMethodsSchema.shape.paymentMethods.optional(),
    cashRounding: CashRoundingSchema.optional(),
  })
  .refine(
    (data) =>
      data.paymentMethods !== undefined || data.cashRounding !== undefined,
    { message: 'At least one payment setting is required' }
  );

type PaymentSettingsUpdate = z.infer<typeof PaymentSettingsUpdateSchema>;

interface PaymentSettingsBody {
  success: true;
  message: string;
  restaurant: {
    id: string;
    paymentMethods: Prisma.JsonValue;
    cashRounding: string;
    businessDayCloseTime: string;
    updatedAt: Date;
  };
}

const RESTAURANT_SELECT = {
  id: true,
  paymentMethods: true,
  cashRounding: true,
  businessDayCloseTime: true,
  updatedAt: true,
} as const;

/**
 * Apply the payment settings update and write the audit row in the caller's
 * transaction. The audit contains only setting names/values, never PII.
 */
async function applyPaymentSettingsUpdate(
  tx: TransactionClient,
  input: {
    restaurantId: string;
    userId: string;
    userType?: string | null;
    data: PaymentSettingsUpdate;
  }
): Promise<{ body: PaymentSettingsBody; statusCode: number }> {
  const current = await tx.restaurant.findUnique({
    where: { id: input.restaurantId },
    select: { paymentMethods: true, cashRounding: true },
  });
  if (!current) throw new Error('Restaurant not found');

  const updatedRestaurant = await tx.restaurant.update({
    where: { id: input.restaurantId },
    data: {
      ...(input.data.paymentMethods !== undefined
        ? { paymentMethods: input.data.paymentMethods }
        : {}),
      ...(input.data.cashRounding !== undefined
        ? { cashRounding: input.data.cashRounding }
        : {}),
    },
    select: RESTAURANT_SELECT,
  });

  await tx.auditLog.create({
    data: {
      tableName: 'restaurants',
      recordId: input.restaurantId,
      operation: 'UPDATE',
      oldValues: {
        paymentMethods: current.paymentMethods as Prisma.InputJsonValue,
        cashRounding: current.cashRounding ?? 'NONE',
      },
      newValues: {
        paymentMethods:
          updatedRestaurant.paymentMethods as Prisma.InputJsonValue,
        cashRounding: updatedRestaurant.cashRounding ?? 'NONE',
      },
      changedBy: input.userId,
      changedByType: input.userType ?? null,
      restaurantId: input.restaurantId,
      category: 'payments',
      description: 'Payment settings updated',
    },
  });

  return {
    body: {
      success: true,
      message:
        input.data.paymentMethods !== undefined
          ? 'Payment methods updated successfully'
          : 'Payment settings updated successfully',
      restaurant: {
        ...updatedRestaurant,
        cashRounding: updatedRestaurant.cashRounding ?? 'NONE',
      },
    },
    statusCode: 200,
  };
}

/**
 * GET /api/settings/restaurant/payments
 * Read payment methods, cash rounding and the business-day close time.
 */
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

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: RESTAURANT_SELECT,
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      restaurant: {
        ...restaurant,
        // Null reads as NONE for pre-migration rows (§18.20.15 D).
        cashRounding: restaurant.cashRounding ?? 'NONE',
      },
    });
  } catch (error) {
    return handlePaymentSettingsError(error, 'GET');
  }
}

/**
 * PUT /api/settings/restaurant/payments
 * Update payment methods and/or the cash rounding policy.
 */
export async function PUT(request: NextRequest) {
  try {
    // 1. Authentication & Authorization
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings', 'write');

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

    // 2. Parse and validate request body
    const body = await request.json();
    const result = PaymentSettingsUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          code: 'INVALID_REQUEST',
          details: result.error.issues,
        },
        { status: 400 }
      );
    }

    // 3. Update restaurant and audit in one transaction. The idempotency key
    //    is optional: existing clients that omit it keep working, but new
    //    clients get durable replay protection.
    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    const execute = (tx: TransactionClient) =>
      applyPaymentSettingsUpdate(tx, {
        restaurantId,
        userId: context!.userId,
        userType: context!.userType,
        data: result.data,
      });

    if (idempotencyKey) {
      const outcome = await runIdempotentOwnerMutation<PaymentSettingsBody>({
        restaurantId,
        action: 'settings.payments.update',
        key: idempotencyKey,
        requestHash: stableRequestHash({
          restaurantId,
          paymentMethods: result.data.paymentMethods ?? null,
          cashRounding: result.data.cashRounding ?? null,
        }),
        execute,
      });

      return NextResponse.json(outcome.body, {
        status: outcome.statusCode,
        headers: outcome.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      });
    }

    const outcome = await prisma.$transaction(execute);
    return NextResponse.json(outcome.body, {
      status: outcome.statusCode ?? 200,
    });
  } catch (error) {
    return handlePaymentSettingsError(error, 'PUT');
  }
}

function handlePaymentSettingsError(
  error: unknown,
  method: 'GET' | 'PUT'
): NextResponse {
  console.error(
    `Error ${method === 'GET' ? 'reading' : 'updating'} payment settings`
  );

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
  if (error instanceof Error && error.message.includes('Access denied')) {
    return NextResponse.json(
      { success: false, error: error.message, code: 'PERMISSION_DENIED' },
      { status: 403 }
    );
  }
  if (error instanceof Error && error.message.includes('Authentication')) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }
  if (error instanceof Error && error.message.includes('Permission denied')) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: 'PERMISSION_DENIED',
      },
      { status: 403 }
    );
  }

  // Keep the legacy 500 body byte-for-byte for existing clients (F-07).
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
