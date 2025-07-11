import { NextRequest, NextResponse } from 'next/server';
import { AuthService, AUTH_CONSTANTS } from '@/lib/auth';
import { prisma } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find staff member with role
    const staff = await prisma.staff.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: true },
    });

    if (!staff) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    if (!staff.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated' },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (staff.lockedUntil && staff.lockedUntil > new Date()) {
      const lockoutMinutes = Math.ceil(
        (staff.lockedUntil.getTime() - Date.now()) / (1000 * 60)
      );
      return NextResponse.json(
        { error: `Account locked. Try again in ${lockoutMinutes} minutes.` },
        { status: 423 }
      );
    }

    // Verify password
    const isValidPassword = await AuthService.verifyPassword(
      password,
      staff.passwordHash
    );

    if (!isValidPassword) {
      // Increment failed login attempts
      const failedAttempts = staff.failedLoginAttempts + 1;
      const shouldLock = failedAttempts >= AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS;

      await prisma.staff.update({
        where: { id: staff.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + AUTH_CONSTANTS.LOCKOUT_DURATION)
            : null,
        },
      });

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Reset failed login attempts and update last login
    await prisma.staff.update({
      where: { id: staff.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Generate JWT token
    const token = AuthService.generateToken(staff);

    // Create staff session
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.staffSession.create({
      data: {
        staffId: staff.id,
        sessionToken,
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        expiresAt,
      },
    });

    // Create response
    const response = NextResponse.json({
      message: 'Login successful',
      staff: {
        id: staff.id,
        email: staff.email,
        username: staff.username,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: {
          id: staff.role.id,
          name: staff.role.name,
          permissions: staff.role.permissions,
        },
        restaurantId: staff.restaurantId,
      },
    });

    // Set cookie using Set-Cookie header
    const cookieValue = `${AUTH_CONSTANTS.COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${24 * 60 * 60}; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
    response.headers.set('Set-Cookie', cookieValue);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
