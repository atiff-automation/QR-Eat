/**
 * Settings API - Update Financial Settings
 *
 * PUT /api/settings/restaurant/financial
 * Update tax, service charge, currency, and labels
 *
 * Permission: settings:financial:write (Owner only)
 *
 * @see implementation_plan_production_v3.md - API Layer
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { FinancialSettingsSchema } from '@/lib/validation/settings-schemas';

export async function PUT(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings:financial', 'write');

    const body = await request.json();
    const validatedData = FinancialSettingsSchema.parse(body);

    const updated = await prisma.restaurant.update({
      where: { id: context!.restaurantId! },
      data: {
        currency: validatedData.currency,
        taxRate: validatedData.taxRate,
        serviceChargeRate: validatedData.serviceChargeRate,
        taxLabel: validatedData.taxLabel,
        serviceChargeLabel: validatedData.serviceChargeLabel,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tableName: 'restaurants',
        recordId: updated.id,
        operation: 'UPDATE',
        newValues: { section: 'financial', ...validatedData },
        changedBy: context!.userId!,
        changedByType: context!.userType!,
        ...(context!.userType === 'staff' && { staffId: context!.userId }),
        ...(context!.userType === 'restaurant_owner' && {
          ownerId: context!.userId,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Financial settings updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('[Settings API] Financial update error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to update financial settings' },
      { status: 500 }
    );
  }
}
