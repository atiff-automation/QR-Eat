/**
 * Owner Restaurants API
 * Simple cookie-based authentication for owner dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService, AUTH_CONSTANTS } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Get JWT token from any user-type specific cookie
    const token = request.cookies.get(AUTH_CONSTANTS.OWNER_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.STAFF_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.ADMIN_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.COOKIE_NAME)?.value;
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify token
    const payload = AuthService.verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Only restaurant owners can access this endpoint
    if (payload.userType !== 'restaurant_owner') {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Fetch restaurants owned by this user
    const restaurants = await prisma.restaurant.findMany({
      where: { ownerId: payload.userId },
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