/**
 * Restaurant Settings API - Notification Settings
 * Update notification preferences (alerts, sounds, desktop notifications)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { NotificationSettingsSchema } from '@/lib/validation/settings-schemas';

/**
 * PUT /api/settings/restaurant/notifications
 * Update notification settings
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
    const result = NotificationSettingsSchema.safeParse(body);

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
        notificationSettings: result.data.notificationSettings,
      },
      select: {
        id: true,
        notificationSettings: true,
        updatedAt: true,
      },
    });

    // 4. Return success response
    return NextResponse.json({
      success: true,
      message: 'Notification settings updated successfully',
      restaurant: updatedRestaurant,
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);

    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
