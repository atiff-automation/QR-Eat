/**
 * Settings API - Get Restaurant Settings
 *
 * GET /api/settings/restaurant
 * Fetch all restaurant settings for the current user's restaurant
 *
 * @see implementation_plan_production_v3.md - API Layer
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings', 'read');

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: context!.restaurantId! },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        timezone: true,
        currency: true,
        taxRate: true,
        serviceChargeRate: true,
        taxLabel: true,
        serviceChargeLabel: true,
        operatingHours: true,
        notificationSettings: true,
        receiptSettings: true,
        paymentMethods: true,
        systemPreferences: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: restaurant,
    });
  } catch (error) {
    console.error('[Settings API] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch settings',
      },
      { status: 500 }
    );
  }
}
