import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { BusinessDaySettingsSchema } from '@/lib/validation/settings-schemas';

export async function PUT(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings', 'write');
    const restaurantId = context!.restaurantId!;
    await requireRestaurantAccess(restaurantId, context!);

    const body = await request.json();
    const result = BusinessDaySettingsSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 }
      );
    }

    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        timezone: result.data.timezone,
        businessDayCloseTime: result.data.businessDayCloseTime,
        openingFloatDefault: result.data.openingFloatDefault,
        cashDrawerEnabled: result.data.cashDrawerEnabled,
      },
      select: {
        timezone: true,
        businessDayCloseTime: true,
        openingFloatDefault: true,
        cashDrawerEnabled: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error('Error updating business-day settings:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
