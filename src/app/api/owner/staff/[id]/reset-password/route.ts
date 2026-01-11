import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { prisma } from '@/lib/database';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate using RBAC system
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
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

    // Check if user has staff management permissions
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Staff password reset permission check:', {
        userType: authResult.user.userType,
        userPermissions: authResult.user.permissions,
        hasStaffWrite: authResult.user.permissions.includes('staff:write'),
        hasStaffInvite: authResult.user.permissions.includes('staff:invite'),
        hasStaffRoles: authResult.user.permissions.includes('staff:roles'),
        hasStaffRead: authResult.user.permissions.includes('staff:read'),
      });
    }

    const hasStaffPermission =
      authResult.user.permissions.includes('staff:write') ||
      authResult.user.permissions.includes('staff:invite') ||
      authResult.user.permissions.includes('staff:roles');

    if (!hasStaffPermission) {
      console.error('❌ Access denied for staff password reset:', {
        userType: authResult.user.userType,
        userPermissions: authResult.user.permissions,
      });
      return NextResponse.json(
        { error: 'Unauthorized - Staff management permission required' },
        { status: 403 }
      );
    }

    const { id: staffId } = await params;

    // Verify the staff belongs to this user's restaurant
    const userRestaurantId = authResult.user.currentRole?.restaurantId;

    if (!userRestaurantId) {
      return NextResponse.json(
        { error: 'No restaurant context found' },
        { status: 403 }
      );
    }

    // Find the staff member in the RBAC system
    const staffMember = await prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        role: {
          select: {
            name: true,
            permissions: true,
          },
        },
      },
    });

    if (!staffMember || staffMember.restaurantId !== userRestaurantId) {
      return NextResponse.json(
        { error: 'Staff member not found in your restaurant' },
        { status: 404 }
      );
    }

    // Generate temporary password
    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Update staff member with new password and force password change
    await prisma.staff.update({
      where: { id: staffId },
      data: {
        passwordHash: hashedPassword,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Mark any related password reset notifications as completed
    // Use a more targeted approach to avoid potential session conflicts
    try {
      const relatedNotifications = await prisma.notification.findMany({
        where: {
          userId: authResult.user.id,
          isRead: false,
          title: 'Staff Password Reset Request',
        },
      });

      // Define expected metadata structure
      interface PasswordResetMetadata {
        action?: string;
        staffId?: string;
        completed?: boolean;
        completedAt?: string;
        completedBy?: string;
        [key: string]: unknown;
      }

      // Filter and update notifications related to this staff member
      const updatesPromises = relatedNotifications
        .filter((notification) => {
          const metadata =
            notification.metadata as unknown as PasswordResetMetadata;
          return (
            metadata?.action === 'password_reset_request' &&
            metadata?.staffId === staffId
          );
        })
        .map((notification) => {
          const metadata =
            notification.metadata as unknown as PasswordResetMetadata;
          const updatedMetadata: PasswordResetMetadata = {
            ...metadata,
            completed: true,
            completedAt: new Date().toISOString(),
            completedBy: authResult.user.id,
          };

          return prisma.notification.update({
            where: { id: notification.id },
            data: {
              isRead: true,
              readAt: new Date(),
              metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
            },
          });
        });

      // Execute all updates in parallel
      await Promise.all(updatesPromises);
    } catch (notificationError) {
      // Don't fail the password reset if notification update fails
      console.error(
        'Error updating notifications (non-critical):',
        notificationError
      );
    }

    // In production, you would send this via email
    // For development (and current fix as requested), return it in the response
    return NextResponse.json({
      message: 'Password reset successfully',
      temporaryPassword: tempPassword,
      staffName: `${staffMember.firstName} ${staffMember.lastName}`,
      staffEmail: staffMember.email,
    });
  } catch (error) {
    console.error('Owner password reset error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateTemporaryPassword(): string {
  // Generate a secure temporary password
  const length = 12;
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  // Ensure at least one of each type
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // Number
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // Special char

  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle the password
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}
