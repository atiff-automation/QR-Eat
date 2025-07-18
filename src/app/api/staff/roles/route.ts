/**
 * Staff Roles API
 * Handles CRUD operations for staff roles within restaurants
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { UserType } from '@/lib/auth';
import { verifyAuthToken } from '@/lib/auth';

// GET - List all roles for a restaurant
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const restaurantId = url.searchParams.get('restaurantId');

    if (!restaurantId) {
      return NextResponse.json({ error: 'restaurantId parameter required' }, { status: 400 });
    }

    // Check access permissions
    let hasAccess = false;
    
    if (authResult.user.type === UserType.PLATFORM_ADMIN) {
      hasAccess = true;
    } else if (authResult.user.type === UserType.RESTAURANT_OWNER) {
      hasAccess = authResult.user.user.restaurants.some(r => r.id === restaurantId);
    } else if (authResult.user.type === UserType.STAFF) {
      hasAccess = authResult.user.user.restaurantId === restaurantId;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch all available roles (global roles)
    const roles = await prisma.staffRole.findMany({
      where: {},
      include: {
        _count: {
          select: {
            staff: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({
      success: true,
      roles,
      count: roles.length
    });

  } catch (error) {
    console.error('Error fetching staff roles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new staff role
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only restaurant owners can create roles
    if (authResult.user.type !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json({ error: 'Only restaurant owners can create roles' }, { status: 403 });
    }

    const data = await request.json();
    const { name, description, permissions, restaurantId } = data;

    // Validate required fields
    if (!name || !restaurantId || !permissions) {
      return NextResponse.json({ 
        error: 'Missing required fields: name, restaurantId, permissions' 
      }, { status: 400 });
    }

    // Verify owner actually owns this restaurant
    const ownedRestaurant = authResult.user.user.restaurants.find(r => r.id === restaurantId);
    if (!ownedRestaurant) {
      return NextResponse.json({ error: 'Access denied to this restaurant' }, { status: 403 });
    }

    // Check if role name already exists (global unique)
    const existingRole = await prisma.staffRole.findFirst({
      where: {
        name
      }
    });

    if (existingRole) {
      return NextResponse.json({ 
        error: 'Role with this name already exists in this restaurant' 
      }, { status: 409 });
    }

    // Create the role
    const newRole = await prisma.staffRole.create({
      data: {
        name,
        description: description || '',
        permissions
      },
      include: {
        _count: {
          select: {
            staff: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      role: newRole,
      message: 'Staff role created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating staff role:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}