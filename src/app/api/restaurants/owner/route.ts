/**
 * Owner Restaurants API
 * RBAC-based authentication for owner dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(request: NextRequest) {
  try {
    // RBAC Authentication
    const token = request.cookies.get('qr_rbac_token')?.value;
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const validation = await AuthServiceV2.validateToken(token);
    if (!validation.isValid || !validation.user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const user = validation.user;

    // Only restaurant owners can access this endpoint
    if (user.currentRole.userType !== 'restaurant_owner') {
      return NextResponse.json(
        { error: 'Access denied: Only restaurant owners can access this endpoint' },
        { status: 403 }
      );
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