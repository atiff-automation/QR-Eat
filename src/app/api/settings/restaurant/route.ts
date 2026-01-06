/**
 * Restaurant Settings API - GET Endpoint
 * Fetches all restaurant settings for the current user's restaurant
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';

/**
 * GET /api/settings/restaurant
 * Fetch all restaurant settings
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authentication & Authorization
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings', 'read');

    // Get restaurant ID from context
    const restaurantId = context!.restaurantId!;

    // 2. Validate resource access (IDOR protection)
    await requireRestaurantAccess(restaurantId, context!);

    // 3. Fetch restaurant settings
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
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
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    // 4. Return settings
    return NextResponse.json({
      success: true,
      settings: restaurant,
    });
  } catch (error) {
    console.error('Error fetching restaurant settings:', error);

    // Handle RBAC errors
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
