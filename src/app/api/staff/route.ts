/**
 * Staff Management API
 * Handles CRUD operations for restaurant staff
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService, UserType } from '@/lib/auth';
import { verifyAuthToken } from '@/lib/auth';

// GET - List all staff for the authenticated user's restaurant
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Platform admins, restaurant owners, and staff can access staff data
    if (authResult.user.type === UserType.PLATFORM_ADMIN) {
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
    
    if (authResult.user.type === UserType.RESTAURANT_OWNER) {
      // For restaurant owners, get the restaurant ID from query params or use their first restaurant
      const url = new URL(request.url);
      restaurantId = url.searchParams.get('restaurantId') || authResult.user.user.restaurants[0]?.id;
      
      if (!restaurantId) {
        return NextResponse.json({ error: 'No restaurant found' }, { status: 404 });
      }
      
      // Verify owner actually owns this restaurant
      const ownedRestaurant = authResult.user.user.restaurants.find(r => r.id === restaurantId);
      if (!ownedRestaurant) {
        return NextResponse.json({ error: 'Access denied to this restaurant' }, { status: 403 });
      }
    } else if (authResult.user.type === UserType.STAFF) {
      restaurantId = authResult.user.user.restaurantId;
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
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only restaurant owners can create staff
    if (authResult.user.type !== UserType.RESTAURANT_OWNER) {
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
    const ownedRestaurant = authResult.user.user.restaurants.find(r => r.id === restaurantId);
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