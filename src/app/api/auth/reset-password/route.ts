import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email, userType } = await request.json();

    if (!email || !userType) {
      return NextResponse.json(
        { error: 'Email and user type are required' },
        { status: 400 }
      );
    }

    // Find user based on type
    let user = null;
    
    switch (userType) {
      case 'staff':
        user = await prisma.staff.findUnique({
          where: { email },
          include: { restaurant: true }
        });
        tableName = 'staff';
        break;
      case 'restaurant_owner':
        user = await prisma.restaurantOwner.findUnique({
          where: { email }
        });
        tableName = 'restaurant_owner';
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid user type' },
          { status: 400 }
        );
    }

    if (!user) {
      // Don't reveal if email exists for security
      return NextResponse.json(
        { message: 'If the email exists, a password reset link will be sent.' },
        { status: 200 }
      );
    }

    // Generate reset token and expiry
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Update user with reset token
    switch (userType) {
      case 'staff':
        await prisma.staff.update({
          where: { id: user.id },
          data: {
            passwordResetToken: resetToken,
            passwordResetExpires: resetExpires
          }
        });
        break;
      case 'restaurant_owner':
        await prisma.restaurantOwner.update({
          where: { id: user.id },
          data: {
            passwordResetToken: resetToken,
            passwordResetExpires: resetExpires
          }
        });
        break;
    }

    // In a real app, you would send an email here
    // For now, we'll return the token for testing purposes
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔑 Password reset token for ${email}: ${resetToken}`);
      return NextResponse.json({
        message: 'Password reset token generated successfully.',
        resetToken: resetToken, // Only in development
        resetUrl: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`
      });
    }

    return NextResponse.json({
      message: 'If the email exists, a password reset link will be sent.'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Find user with valid reset token
    const now = new Date();
    
    let user = null;
    let userType = '';

    // Check staff table
    user = await prisma.staff.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: now
        }
      }
    });

    if (user) {
      userType = 'staff';
    } else {
      // Check restaurant owner table
      user = await prisma.restaurantOwner.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: {
            gt: now
          }
        }
      });
      if (user) {
        userType = 'restaurant_owner';
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset token
    const updateData = {
      passwordHash: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      passwordChangedAt: new Date(),
      mustChangePassword: false // Password has been changed
    };

    switch (userType) {
      case 'staff':
        await prisma.staff.update({
          where: { id: user.id },
          data: updateData
        });
        break;
      case 'restaurant_owner':
        await prisma.restaurantOwner.update({
          where: { id: user.id },
          data: updateData
        });
        break;
    }

    return NextResponse.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Password reset confirmation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}