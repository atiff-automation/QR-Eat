/**
 * Staff Roles API
 * Handles CRUD operations for staff roles within restaurants
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { STAFF_PERMISSIONS } from '@/lib/rbac/permission-constants';
import { revalidateTag } from 'next/cache';

// GET - List all roles for a restaurant
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const restaurantId = url.searchParams.get('restaurantId');

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'restaurantId parameter required' },
        { status: 400 }
      );
    }

    // Authenticate and authorize using RBAC middleware
    const auth = await requireAuth(request, [STAFF_PERMISSIONS.READ]);

    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    // Fetch all available roles (global roles)
    const roles = await prisma.staffRole.findMany({
      where: {},
      include: {
        _count: {
          select: {
            staff: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(
      {
        success: true,
        roles,
        count: roles.length,
      },
      {
        headers: {
          'Cache-Control': 'private, s-maxage=3600',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching staff roles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new staff role
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { name, description, permissions, restaurantId } = data;

    // Validate required fields
    if (!name || !restaurantId || !permissions) {
      return NextResponse.json(
        {
          error: 'Missing required fields: name, restaurantId, permissions',
        },
        { status: 400 }
      );
    }

    // Authenticate and authorize using RBAC middleware
    const auth = await requireAuth(request, [STAFF_PERMISSIONS.ROLES]);

    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    // Check if role name already exists (global unique)
    const existingRole = await prisma.staffRole.findFirst({
      where: {
        name,
      },
    });

    if (existingRole) {
      return NextResponse.json(
        {
          error: 'Role with this name already exists in this restaurant',
        },
        { status: 409 }
      );
    }

    // Create the role
    const newRole = await prisma.staffRole.create({
      data: {
        name,
        description: description || '',
        permissions,
      },
      include: {
        _count: {
          select: {
            staff: true,
          },
        },
      },
    });

    // Clear roles cache
    revalidateTag('staff-roles');
    revalidateTag(`staff-roles-${restaurantId}`);

    return NextResponse.json(
      {
        success: true,
        role: newRole,
        message: 'Staff role created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating staff role:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
