/**
 * Individual Staff Management API
 * Handles operations for specific staff members
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService, UserType } from '@/lib/auth';
import { verifyAuthToken } from '@/lib/auth';

// GET - Fetch specific staff member details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Fetch the staff member
    const staff = await prisma.staff.findUnique({
      where: { id },
      include: {
        role: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerId: true
          }
        }
      }
    });

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Check access permissions
    let hasAccess = false;
    
    if (authResult.user.type === UserType.PLATFORM_ADMIN) {
      hasAccess = true;
    } else if (authResult.user.type === UserType.RESTAURANT_OWNER) {
      hasAccess = staff.restaurant.ownerId === authResult.user.user.id;
    } else if (authResult.user.type === UserType.STAFF) {
      hasAccess = staff.restaurantId === authResult.user.user.restaurantId;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      staff
    });

  } catch (error) {
    console.error('Error fetching staff member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update staff member
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only restaurant owners can update staff
    if (authResult.user.type !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json({ error: 'Only restaurant owners can update staff' }, { status: 403 });
    }

    const data = await request.json();
    const { firstName, lastName, phone, roleId, isActive, password } = data;

    // Fetch the staff member to verify ownership
    const existingStaff = await prisma.staff.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!existingStaff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Verify owner actually owns this restaurant
    if (existingStaff.restaurant.ownerId !== authResult.user.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Prepare update data
    const updateData: any = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Handle role change
    if (roleId && roleId !== existingStaff.roleId) {
      // Verify the new role exists and belongs to the restaurant
      const role = await prisma.staffRole.findFirst({
        where: {
          id: roleId,
          restaurantId: existingStaff.restaurantId
        }
      });

      if (!role) {
        return NextResponse.json({ error: 'Invalid role for this restaurant' }, { status: 400 });
      }

      updateData.roleId = roleId;
    }

    // Handle password change
    if (password) {
      updateData.passwordHash = await AuthService.hashPassword(password);
    }

    // Update the staff member
    const updatedStaff = await prisma.staff.update({
      where: { id },
      data: updateData,
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
      staff: updatedStaff,
      message: 'Staff member updated successfully'
    });

  } catch (error) {
    console.error('Error updating staff member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove staff member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only restaurant owners can delete staff
    if (authResult.user.type !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json({ error: 'Only restaurant owners can delete staff' }, { status: 403 });
    }

    // Fetch the staff member to verify ownership
    const existingStaff = await prisma.staff.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!existingStaff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Verify owner actually owns this restaurant
    if (existingStaff.restaurant.ownerId !== authResult.user.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete all related sessions first
    await prisma.staffSession.deleteMany({
      where: { staffId: id }
    });

    // Delete the staff member
    await prisma.staff.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: 'Staff member deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting staff member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}