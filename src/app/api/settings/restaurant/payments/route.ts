/**
 * Restaurant Settings API - Payment Methods
 * Update accepted payment methods (cash, card, e-wallet)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { PaymentMethodsSchema } from '@/lib/validation/settings-schemas';

/**
 * PUT /api/settings/restaurant/payments
 * Update payment methods
 */
export async function PUT(request: NextRequest) {
  try {
    // 1. Authentication & Authorization
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings', 'write');

    const restaurantId = context!.restaurantId!;
    await requireRestaurantAccess(restaurantId, context!);

    // 2. Parse and validate request body
    const body = await request.json();
    const result = PaymentMethodsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: result.error.errors,
        },
        { status: 400 }
      );
    }

    // 3. Update restaurant
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        paymentMethods: result.data.paymentMethods,
      },
      select: {
        id: true,
        paymentMethods: true,
        updatedAt: true,
      },
    });

    // 4. Return success response
    return NextResponse.json({
      success: true,
      message: 'Payment methods updated successfully',
      restaurant: updatedRestaurant,
    });
  } catch (error) {
    console.error('Error updating payment methods:', error);

    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
