import { NextRequest, NextResponse } from 'next/server';
import { AuthService, AUTH_CONSTANTS, UserType } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get(AUTH_CONSTANTS.COOKIE_NAME)?.value ||
      AuthService.extractTokenFromHeader(request.headers.get('authorization'));

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const payload = AuthService.verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get user information based on user type
    let userData: any = null;

    switch (payload.userType) {
      case UserType.PLATFORM_ADMIN:
        const admin = await prisma.platformAdmin.findUnique({
          where: { id: payload.userId },
        });
        if (admin && admin.isActive) {
          userData = {
            id: admin.id,
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: admin.role,
            userType: UserType.PLATFORM_ADMIN,
            lastLoginAt: admin.lastLoginAt,
          };
        }
        break;

      case UserType.RESTAURANT_OWNER:
        const owner = await prisma.restaurantOwner.findUnique({
          where: { id: payload.userId },
          include: {
            restaurants: {
              select: {
                id: true,
                name: true,
                slug: true,
                timezone: true,
                currency: true,
              },
            },
          },
        });
        if (owner && owner.isActive) {
          userData = {
            id: owner.id,
            email: owner.email,
            firstName: owner.firstName,
            lastName: owner.lastName,
            phone: owner.phone,
            companyName: owner.companyName,
            userType: UserType.RESTAURANT_OWNER,
            restaurants: owner.restaurants,
            lastLoginAt: owner.lastLoginAt,
          };
        }
        break;

      case UserType.STAFF:
        const staff = await prisma.staff.findUnique({
          where: { id: payload.userId },
          include: {
            role: true,
            restaurant: {
              select: {
                id: true,
                name: true,
                slug: true,
                timezone: true,
                currency: true,
              },
            },
          },
        });
        if (staff && staff.isActive) {
          userData = {
            id: staff.id,
            email: staff.email,
            username: staff.username,
            firstName: staff.firstName,
            lastName: staff.lastName,
            phone: staff.phone,
            userType: UserType.STAFF,
            role: {
              id: staff.role.id,
              name: staff.role.name,
              description: staff.role.description,
              permissions: staff.role.permissions,
            },
            restaurant: staff.restaurant,
            restaurantId: staff.restaurantId,
            lastLoginAt: staff.lastLoginAt,
          };
        }
        break;
    }

    if (!userData) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: userData,
      permissions: payload.permissions,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
