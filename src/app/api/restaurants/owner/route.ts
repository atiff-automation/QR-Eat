/**
 * Owner Restaurants API
 * RBAC-based authentication for owner dashboard
 * 
 * Following CLAUDE.md principles:
 * - Type Safety: Proper TypeScript types throughout
 * - Error Handling: Comprehensive error cases
 * - RBAC Integration: Shared helpers for authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  validateRBACToken,
  createErrorResponse,
  logAccessDenied,
  hasRoleType
} from '@/lib/rbac/route-helpers';
import type { EnhancedAuthenticatedUser } from '@/lib/rbac/types';

export async function GET(request: NextRequest) {
  try {
    // RBAC Authentication with proper types
    const authResult = await validateRBACToken(request);
    if (!authResult.success || !authResult.user) {
      return createErrorResponse(
        authResult.error!.message,
        authResult.error!.status
      );
    }

    const user: EnhancedAuthenticatedUser = authResult.user;

    // Only restaurant owners can access this endpoint
    if (!hasRoleType(user, 'restaurant_owner')) {
      await logAccessDenied(user, 'owner:restaurants', 'Not a restaurant owner', request);
      return createErrorResponse('Access denied: Only restaurant owners can access this endpoint', 403);
    }

    // Fetch restaurants owned by this user
    const restaurants = await prisma.restaurant.findMany({
      where: { ownerId: user.id },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        email: true,
        currency: true,
        businessType: true,
        isActive: true,
        description: true,
        website: true,
        logoUrl: true,
        priceRange: true,
        acceptsReservations: true,
        deliveryAvailable: true,
        takeoutAvailable: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({
      success: true,
      restaurants,
      count: restaurants.length
    });

  } catch (error) {
    console.error('Error fetching owner restaurants:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}