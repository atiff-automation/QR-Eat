import { NextRequest, NextResponse } from 'next/server';
import { AuthService, AUTH_CONSTANTS } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { cookies } from 'next/headers';

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

    // Get current staff information
    const staff = await prisma.staff.findUnique({
      where: { id: payload.staffId },
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

    if (!staff || !staff.isActive) {
      return NextResponse.json(
        { error: 'Staff member not found or inactive' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      staff: {
        id: staff.id,
        email: staff.email,
        username: staff.username,
        firstName: staff.firstName,
        lastName: staff.lastName,
        phone: staff.phone,
        role: {
          id: staff.role.id,
          name: staff.role.name,
          description: staff.role.description,
          permissions: staff.role.permissions,
        },
        restaurant: staff.restaurant,
        lastLoginAt: staff.lastLoginAt,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
