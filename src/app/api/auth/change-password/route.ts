import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { AuthService } from '@/lib/auth';
import { UserType } from '@/lib/rbac/types';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    // Get authentication token using RBAC system
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate token using RBAC system
    const authResult = await AuthServiceV2.validateToken(token);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const { user } = authResult;

    // Only staff and restaurant owners can change passwords through this endpoint
    if (
      user.userType !== UserType.STAFF &&
      user.userType !== UserType.RESTAURANT_OWNER
    ) {
      return NextResponse.json(
        { error: 'This endpoint is for staff and restaurant owners only' },
        { status: 403 }
      );
    }

    // Get client information for audit
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Get user details from database for password verification
    let dbUser;
    if (user.userType === UserType.STAFF) {
      dbUser = await prisma.staff.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          passwordHash: true,
          mustChangePassword: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });
    } else if (user.userType === UserType.RESTAURANT_OWNER) {
      dbUser = await prisma.restaurantOwner.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          passwordHash: true,
          mustChangePassword: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });
    }

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify current password
    const isCurrentPasswordValid = await AuthService.verifyPassword(
      currentPassword,
      dbUser.passwordHash
    );

    if (!isCurrentPasswordValid) {
      await AuditLogger.logSecurityEvent(
        user.id,
        'PASSWORD_CHANGE_INVALID_CURRENT',
        'medium',
        'User attempted to change password with incorrect current password',
        {
          ipAddress: clientIP,
          userAgent,
          metadata: { userType: user.userType },
        }
      );

      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Check if new password is same as current password
    const isSamePassword = await AuthService.verifyPassword(
      newPassword,
      dbUser.passwordHash
    );

    if (isSamePassword) {
      return NextResponse.json(
        { error: 'New password must be different from current password' },
        { status: 400 }
      );
    }

    // For users with mustChangePassword=true, ensure they can't reuse generated password
    if (dbUser.mustChangePassword) {
      // The current password IS the generated password, so we already checked above
      // that new password is different from current (generated) password
    }

    // Hash new password
    const newPasswordHash = await AuthService.hashPassword(newPassword);

    // Update user password
    if (user.userType === UserType.STAFF) {
      await prisma.staff.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });
    } else if (user.userType === UserType.RESTAURANT_OWNER) {
      await prisma.restaurantOwner.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });
    }

    // Log password change for security and audit
    await AuditLogger.logSecurityEvent(
      user.id,
      'PASSWORD_CHANGED',
      'medium',
      'User successfully changed their password',
      {
        ipAddress: clientIP,
        userAgent,
        metadata: {
          userType: user.userType,
          wasMustChange: dbUser.mustChangePassword,
        },
      }
    );

    console.log(
      `Password changed for ${user.userType}: ${user.email} (ID: ${user.id})`
    );

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Failed to change password:', error);

    if (error instanceof Error) {
      if (error.message.includes('Password validation failed')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
