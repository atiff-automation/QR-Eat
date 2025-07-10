import { NextResponse } from 'next/server';
import { AuthService, AUTH_CONSTANTS } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_CONSTANTS.COOKIE_NAME)?.value;

    if (token) {
      // Verify token and get staff ID
      const payload = AuthService.verifyToken(token);

      if (payload) {
        // Invalidate all sessions for this staff member
        await prisma.staffSession.deleteMany({
          where: {
            staffId: payload.staffId,
            expiresAt: { gt: new Date() },
          },
        });
      }
    }

    // Clear the authentication cookie
    cookieStore.delete(AUTH_CONSTANTS.COOKIE_NAME);

    return NextResponse.json({
      message: 'Logout successful',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
