import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { UserType } from '@/lib/rbac/types';
import { Sanitizer } from '@/lib/validation';

// PUT - Update staff member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; staffId: string }> }
) {
  try {
    const { id: restaurantId, staffId } = await params;

    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners can update staff
    if (authResult.user.userType !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can update staff' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner and staff belongs to the restaurant
    const staffMember = await prisma.staff.findFirst({
      where: {
        id: staffId,
        restaurantId,
        restaurant: {
          ownerId: authResult.user.id
        }
      },
      include: {
        restaurant: true,
        role: true
      }
    });

    if (!staffMember) {
      return NextResponse.json(
        { error: 'Staff member not found or access denied' },
        { status: 404 }
      );
    }

    const requestData = await request.json();

    // Validate required fields
    const requiredFields = ['username', 'email', 'firstName', 'lastName', 'roleId'];
    for (const field of requiredFields) {
      if (!requestData[field]) {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    // Check if username already exists (excluding current staff)
    if (requestData.username !== staffMember.username) {
      const existingUsername = await prisma.staff.findUnique({
        where: { username: requestData.username }
      });

      if (existingUsername) {
        return NextResponse.json(
          { error: 'Username already exists' },
          { status: 409 }
        );
      }
    }

    // Check if email already exists (excluding current staff)
    if (requestData.email.toLowerCase() !== staffMember.email) {
      const existingEmail = await prisma.staff.findUnique({
        where: { email: requestData.email.toLowerCase() }
      });

      if (existingEmail) {
        return NextResponse.json(
          { error: 'Email already exists' },
          { status: 409 }
        );
      }
    }

    // Validate role exists
    const role = await prisma.staffRole.findUnique({
      where: { id: requestData.roleId }
    });

    if (!role) {
      return NextResponse.json(
        { error: 'Invalid role selected' },
        { status: 400 }
      );
    }

    // Update staff member
    const updatedStaff = await prisma.staff.update({
      where: { id: staffId },
      data: {
        username: Sanitizer.sanitizeString(requestData.username),
        email: Sanitizer.sanitizeEmail(requestData.email),
        firstName: Sanitizer.sanitizeString(requestData.firstName),
        lastName: Sanitizer.sanitizeString(requestData.lastName),
        phone: requestData.phone ? Sanitizer.sanitizePhone(requestData.phone) : null,
        roleId: requestData.roleId
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Staff member updated successfully',
      staff: updatedStaff
    });

  } catch (error) {
    console.error('Failed to update staff:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update staff',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// PATCH - Update staff status (activate/deactivate)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; staffId: string }> }
) {
  try {
    const { id: restaurantId, staffId } = await params;

    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners can update staff status
    if (authResult.user.userType !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can update staff status' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner and staff belongs to the restaurant
    const staffMember = await prisma.staff.findFirst({
      where: {
        id: staffId,
        restaurantId,
        restaurant: {
          ownerId: authResult.user.id
        }
      }
    });

    if (!staffMember) {
      return NextResponse.json(
        { error: 'Staff member not found or access denied' },
        { status: 404 }
      );
    }

    const requestData = await request.json();

    // Update staff status
    const updatedStaff = await prisma.staff.update({
      where: { id: staffId },
      data: {
        isActive: requestData.isActive
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Staff member ${requestData.isActive ? 'activated' : 'deactivated'} successfully`,
      staff: updatedStaff
    });

  } catch (error) {
    console.error('Failed to update staff status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update staff status',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete staff member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; staffId: string }> }
) {
  try {
    const { id: restaurantId, staffId } = await params;

    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners can delete staff
    if (authResult.user.userType !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can delete staff' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner and staff belongs to the restaurant
    const staffMember = await prisma.staff.findFirst({
      where: {
        id: staffId,
        restaurantId,
        restaurant: {
          ownerId: authResult.user.id
        }
      }
    });

    if (!staffMember) {
      return NextResponse.json(
        { error: 'Staff member not found or access denied' },
        { status: 404 }
      );
    }

    // Delete staff member
    await prisma.staff.delete({
      where: { id: staffId }
    });

    return NextResponse.json({
      success: true,
      message: `Staff member "${staffMember.firstName} ${staffMember.lastName}" deleted successfully`
    });

  } catch (error) {
    console.error('Failed to delete staff:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete staff',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}