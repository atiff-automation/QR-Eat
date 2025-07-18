import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService, AUTH_CONSTANTS } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get(AUTH_CONSTANTS.OWNER_COOKIE_NAME)?.value ||
      cookieStore.get(AUTH_CONSTANTS.STAFF_COOKIE_NAME)?.value ||
      cookieStore.get(AUTH_CONSTANTS.ADMIN_COOKIE_NAME)?.value ||
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

    const { isRead } = await request.json();
    const notificationId = params.id;

    // Update notification if it belongs to the current user
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId: payload.userId,
        userType: payload.userType
      }
    });

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    const updatedNotification = await prisma.notification.update({
      where: { id: notificationId },
      data: { 
        isRead,
        readAt: isRead ? new Date() : null
      }
    });

    return NextResponse.json({
      notification: updatedNotification
    });

  } catch (error) {
    console.error('Notification update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}