import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { UserType, AuthService } from '@/lib/auth';
import { 
  getTenantContext, 
  requireAuth, 
  requirePermission 
} from '@/lib/tenant-context';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'write');

    const { firstName, lastName, email, username, phone, roleId, password, isActive } = await request.json();
    const staffId = params.id;

    if (!firstName || !lastName || !email || !username || !roleId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get restaurant ID based on user type
    let restaurantId: string;
    if (context!.userType === UserType.RESTAURANT_OWNER) {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: context!.userId },
        select: { id: true }
      });
      
      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'No restaurant found for owner' },
          { status: 404 }
        );
      }
      
      restaurantId = ownerRestaurant.id;
    } else {
      restaurantId = context!.restaurantId!;
    }

    // Check if staff exists and belongs to restaurant
    const existingStaff = await prisma.staff.findFirst({
      where: { 
        id: staffId,
        restaurantId 
      }
    });

    if (!existingStaff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      );
    }

    // Check if email already exists (excluding current staff)
    const existingEmail = await prisma.staff.findFirst({
      where: { 
        email: email.toLowerCase(),
        NOT: { id: staffId }
      }
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: 'Staff member with this email already exists' },
        { status: 409 }
      );
    }

    // Check if username already exists (excluding current staff)
    const existingUsername = await prisma.staff.findFirst({
      where: { 
        username,
        NOT: { id: staffId }
      }
    });

    if (existingUsername) {
      return NextResponse.json(
        { error: 'Staff member with this username already exists' },
        { status: 409 }
      );
    }

    // Verify role exists
    const role = await prisma.staffRole.findUnique({
      where: { id: roleId }
    });

    if (!role) {
      return NextResponse.json(
        { error: 'Invalid role selected' },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {
      email: email.toLowerCase(),
      username,
      firstName,
      lastName,
      phone: phone || null,
      roleId,
      isActive: isActive ?? true
    };

    // Hash new password if provided
    if (password && password.trim() !== '') {
      updateData.passwordHash = await AuthService.hashPassword(password);
    }

    // Update staff member
    const staff = await prisma.staff.update({
      where: { id: staffId },
      data: updateData,
      include: {
        role: true,
        restaurant: true
      }
    });

    return NextResponse.json({
      success: true,
      staff,
      message: 'Staff member updated successfully'
    });

  } catch (error) {
    console.error('Failed to update staff:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to update staff member' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'delete');

    const staffId = params.id;

    // Get restaurant ID based on user type
    let restaurantId: string;
    if (context!.userType === UserType.RESTAURANT_OWNER) {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: context!.userId },
        select: { id: true }
      });
      
      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'No restaurant found for owner' },
          { status: 404 }
        );
      }
      
      restaurantId = ownerRestaurant.id;
    } else {
      restaurantId = context!.restaurantId!;
    }

    // Check if staff exists and belongs to restaurant
    const existingStaff = await prisma.staff.findFirst({
      where: { 
        id: staffId,
        restaurantId 
      }
    });

    if (!existingStaff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      );
    }

    // Delete staff member
    await prisma.staff.delete({
      where: { id: staffId }
    });

    return NextResponse.json({
      success: true,
      message: 'Staff member deleted successfully'
    });

  } catch (error) {
    console.error('Failed to delete staff:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to delete staff member' },
      { status: 500 }
    );
  }
}