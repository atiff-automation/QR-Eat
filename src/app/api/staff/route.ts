/**
 * Staff Management API
 * Handles CRUD operations for restaurant staff
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService } from '@/lib/auth';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

// GET - List all staff for the authenticated user's restaurant
export async function GET(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // User type check
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;

    // Platform admins, restaurant owners, and staff can access staff data
    if (userType === 'platform_admin') {
      // Platform admins can view all staff - get restaurantId from query params
      const url = new URL(request.url);
      const restaurantId = url.searchParams.get('restaurantId');

      if (!restaurantId) {
        return NextResponse.json({ error: 'Restaurant ID required for platform admin' }, { status: 400 });
      }
      
      const staff = await prisma.staff.findMany({
        where: { restaurantId },
        include: {
          role: true,
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({
        success: true,
        staff,
        count: staff.length
      });
    }

    let restaurantId: string;

    if (userType === 'restaurant_owner') {
      // For restaurant owners, get the restaurant ID from query params or use their first restaurant
      const url = new URL(request.url);

      // Get owned restaurants
      const ownedRestaurants = await prisma.restaurant.findMany({
        where: { ownerId: authResult.user.id },
        select: { id: true }
      });

      restaurantId = url.searchParams.get('restaurantId') || ownedRestaurants[0]?.id;

      if (!restaurantId) {
        return NextResponse.json({ error: 'No restaurant found' }, { status: 404 });
      }

      // Verify owner actually owns this restaurant
      const ownedRestaurant = ownedRestaurants.find(r => r.id === restaurantId);
      if (!ownedRestaurant) {
        return NextResponse.json({ error: 'Access denied to this restaurant' }, { status: 403 });
      }
    } else if (userType === 'staff') {
      restaurantId = authResult.user.currentRole?.restaurantId!;
      if (!restaurantId) {
        return NextResponse.json({ error: 'Restaurant access required' }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 403 });
    }

    // Fetch staff members for the restaurant
    const staff = await prisma.staff.findMany({
      where: { restaurantId },
      include: {
        role: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      staff,
      count: staff.length
    });

  } catch (error) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new staff member
export async function POST(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // User type check
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;

    // Only restaurant owners can create staff
    if (userType !== 'restaurant_owner') {
      return NextResponse.json({ error: 'Only restaurant owners can create staff' }, { status: 403 });
    }

    const data = await request.json();
    const { 
      email, 
      username, 
      firstName, 
      lastName, 
      phone, 
      roleId, 
      restaurantId, 
      password 
    } = data;

    // Validate required fields
    if (!email || !username || !firstName || !lastName || !roleId || !restaurantId || !password) {
      return NextResponse.json({ 
        error: 'Missing required fields: email, username, firstName, lastName, roleId, restaurantId, password' 
      }, { status: 400 });
    }

    // Verify owner actually owns this restaurant
    const ownedRestaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        ownerId: authResult.user.id
      }
    });

    if (!ownedRestaurant) {
      return NextResponse.json({ error: 'Access denied to this restaurant' }, { status: 403 });
    }

    // Check if email or username already exists
    const existingStaff = await prisma.staff.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username }
        ]
      }
    });

    if (existingStaff) {
      return NextResponse.json({ 
        error: 'Staff member with this email or username already exists' 
      }, { status: 409 });
    }

    // Verify the role exists and belongs to the restaurant
    const role = await prisma.staffRole.findFirst({
      where: {
        id: roleId,
        restaurantId
      }
    });

    if (!role) {
      return NextResponse.json({ error: 'Invalid role for this restaurant' }, { status: 400 });
    }

    // Hash the password
    const passwordHash = await AuthService.hashPassword(password);

    // Create the staff member
    const newStaff = await prisma.staff.create({
      data: {
        email: email.toLowerCase(),
        username,
        firstName,
        lastName,
        phone,
        passwordHash,
        roleId,
        restaurantId,
        isActive: true
      },
      include: {
        role: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      staff: newStaff,
      message: 'Staff member created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating staff:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}