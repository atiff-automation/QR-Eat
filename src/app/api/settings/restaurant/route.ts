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
import { revalidateTag } from 'next/cache';

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
        description: true,
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
    return NextResponse.json(
      {
        success: true,
        settings: restaurant,
      },
      {
        headers: {
          'Cache-Control':
            'private, s-maxage=1800, stale-while-revalidate=3600',
        },
      }
    );
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

/**
 * PUT /api/settings/restaurant
 * Update restaurant settings (Partial update)
 */
export async function PUT(request: NextRequest) {
  try {
    // 1. Authentication & Authorization
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings', 'write');

    const restaurantId = context!.restaurantId!;
    await requireRestaurantAccess(restaurantId, context!);

    // 2. Parse body
    const body = await request.json();

    // 3. Update restaurant
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...body,
        // Ensure we don't accidentally update ID or relationship fields if passed maliciously
        id: undefined,
        ownerId: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });

    // Clear restaurant info and settings cache
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true },
    });
    if (restaurant?.slug) {
      revalidateTag('restaurant-info');
      revalidateTag(`restaurant-${restaurant.slug}`);
    }

    return NextResponse.json({
      success: true,
      settings: updatedRestaurant,
    });
  } catch (error) {
    console.error('Error updating restaurant settings:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
