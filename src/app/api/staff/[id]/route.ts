/**
 * Individual Staff Management API
 * Handles operations for specific staff members
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService } from '@/lib/auth';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireStaffAccess } from '@/lib/rbac/resource-auth';

// GET - Fetch specific staff member details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'read');

    const { id } = await params;

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireStaffAccess(id, context!);

    const staff = await prisma.staff.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });

    if (!staff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      staff,
    });
  } catch (error) {
    console.error('Error fetching staff member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update staff member
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'write');

    const { id } = await params;

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireStaffAccess(id, context!);

    const data = await request.json();
    const { firstName, lastName, phone, roleId, isActive, password } = data;

    const existingStaff = await prisma.staff.findUnique({
      where: { id },
    });

    if (!existingStaff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Handle role change
    if (roleId && roleId !== existingStaff.roleId) {
      // Verify the new role exists
      const role = await prisma.staffRole.findUnique({
        where: {
          id: roleId,
        },
      });

      if (!role) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
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
            slug: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      staff: updatedStaff,
      message: 'Staff member updated successfully',
    });
  } catch (error) {
    console.error('Error updating staff member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove staff member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'write');

    const { id } = await params;

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireStaffAccess(id, context!);

    const existingStaff = await prisma.staff.findUnique({
      where: { id },
    });

    if (!existingStaff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      );
    }

    // Delete all related sessions first
    await prisma.staffSession.deleteMany({
      where: { staffId: id },
    });

    // Delete the staff member
    await prisma.staff.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Staff member deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting staff member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
