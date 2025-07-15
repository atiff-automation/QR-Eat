import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService, AUTH_CONSTANTS } from '@/lib/auth';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    // Get auth token from cookie
    const authToken = request.cookies.get(AUTH_CONSTANTS.COOKIE_NAME)?.value;
    if (!authToken) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify JWT token
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(authToken, JWT_SECRET) as any;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Only staff members can change passwords through this endpoint
    if (decodedToken.userType !== 'staff') {
      return NextResponse.json(
        { error: 'This endpoint is for staff members only' },
        { status: 403 }
      );
    }

    // Get staff member
    const staff = await prisma.staff.findUnique({
      where: { id: decodedToken.userId },
      select: {
        id: true,
        passwordHash: true,
        mustChangePassword: true,
        firstName: true,
        lastName: true,
        email: true
      }
    });

    if (!staff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      );
    }

    // Verify current password
    const isCurrentPasswordValid = await AuthService.verifyPassword(
      currentPassword, 
      staff.passwordHash
    );

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Check if new password is same as current password
    const isSamePassword = await AuthService.verifyPassword(
      newPassword,
      staff.passwordHash
    );

    if (isSamePassword) {
      return NextResponse.json(
        { error: 'New password must be different from current password' },
        { status: 400 }
      );
    }

    // For staff with mustChangePassword=true, ensure they can't reuse generated password
    if (staff.mustChangePassword) {
      // The current password IS the generated password, so we already checked above
      // that new password is different from current (generated) password
    }

    // Hash new password
    const newPasswordHash = await AuthService.hashPassword(newPassword);

    // Update staff password
    await prisma.staff.update({
      where: { id: staff.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date()
      }
    });

    // Log password change for security
    console.log(`Password changed for staff: ${staff.email} (ID: ${staff.id})`);

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Failed to change password:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Password validation failed')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}