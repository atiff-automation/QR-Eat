import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { UserType, AuthService } from '@/lib/auth';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { generateStaffPassword } from '@/lib/password-generator';
import { UsernameGenerator } from '@/lib/username-generator';

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'read');

    // Get restaurant ID based on user type
    let restaurantId: string;
    if (context!.userType === UserType.RESTAURANT_OWNER) {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: context!.userId },
        select: { id: true },
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

    const staff = await prisma.staff.findMany({
      where: { restaurantId },
      include: {
        role: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      staff,
    });
  } catch (error) {
    console.error('Failed to fetch staff:', error);

    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch staff' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'write');

    const { firstName, lastName, email, phone, roleId, isActive } =
      await request.json();

    if (!firstName || !lastName || !email || !roleId) {
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
        select: { id: true },
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

    // Generate unique username
    const checkUsernameExists = async (username: string): Promise<boolean> => {
      const existing = await prisma.staff.findFirst({
        where: { username },
      });
      return !!existing;
    };

    const generatedUsername = await UsernameGenerator.generateUniqueUsername(
      firstName,
      lastName,
      checkUsernameExists
    );

    // Generate random password
    const generatedPassword = generateStaffPassword();

    // Check if email already exists
    const existingStaff = await prisma.staff.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingStaff) {
      return NextResponse.json(
        { error: 'Staff member with this email already exists' },
        { status: 409 }
      );
    }

    // Verify role exists and belongs to restaurant
    const role = await prisma.staffRole.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      return NextResponse.json(
        { error: 'Invalid role selected' },
        { status: 400 }
      );
    }

    // Hash password (using generated password)
    const passwordHash = await AuthService.hashPassword(generatedPassword);

    // Create staff member and UserRole in a transaction
    const staff = await prisma.$transaction(async (tx) => {
      // Create staff member
      const newStaff = await tx.staff.create({
        data: {
          restaurantId,
          roleId,
          email: email.toLowerCase(),
          username: generatedUsername,
          passwordHash,
          firstName,
          lastName,
          phone: phone || null,
          employeeId: `EMP${Date.now()}`,
          hireDate: new Date(),
          hourlyRate: 0,
          isActive: isActive ?? true,
          emailVerified: false,
          mustChangePassword: true, // Force password change on first login
          passwordChangedAt: new Date(),
        },
        include: {
          role: true,
          restaurant: true,
        },
      });

      // Create UserRole record for RBAC authentication
      // Convert role name to roleTemplate format (e.g., "Kitchen Staff" -> "kitchen_staff")
      const roleTemplate = role.name.toLowerCase().replace(/\s+/g, '_');

      await tx.userRole.create({
        data: {
          userId: newStaff.id,
          userType: 'staff',
          roleTemplate: roleTemplate,
          restaurantId: restaurantId,
          customPermissions: [],
          isActive: true,
        },
      });

      return newStaff;
    });

    return NextResponse.json({
      success: true,
      staff,
      credentials: {
        username: generatedUsername,
        password: generatedPassword,
      },
      message: 'Staff member created successfully',
    });
  } catch (error) {
    console.error('Failed to create staff:', error);

    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'Staff member with this email or username already exists' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create staff member' },
      { status: 500 }
    );
  }
}
