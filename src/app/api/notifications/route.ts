import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { 
  getTenantContext, 
  requireAuth, 
  createRestaurantFilter 
} from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    const context = getTenantContext(request);
    requireAuth(context);

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let where: any = {
      userId: context!.userId,
      userType: context!.userType
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    // Add restaurant filter for staff and restaurant owners
    if (!context!.isAdmin && context!.restaurantId) {
      where.restaurantId = context!.restaurantId;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset
    });

    const unreadCount = await prisma.notification.count({
      where: {
        ...where,
        isRead: false
      }
    });

    return NextResponse.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        limit,
        offset,
        hasMore: notifications.length === limit
      }
    });

  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = getTenantContext(request);
    requireAuth(context);

    const data = await request.json();
    const { title, message, type, targetUserId, targetUserType, restaurantId, metadata } = data;

    // Only admins and system can create notifications for other users
    if (targetUserId && targetUserId !== context!.userId && !context!.isAdmin) {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      );
    }

    const notification = await prisma.notification.create({
      data: {
        title,
        message,
        type: type || 'info',
        userId: targetUserId || context!.userId,
        userType: targetUserType || context!.userType,
        restaurantId,
        metadata: metadata || {},
        isRead: false
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Notification created successfully',
      notification
    });

  } catch (error) {
    console.error('Failed to create notification:', error);
    return NextResponse.json(
      { error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = getTenantContext(request);
    requireAuth(context);

    const data = await request.json();
    const { notificationIds, action } = data;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return NextResponse.json(
        { error: 'notificationIds must be an array' },
        { status: 400 }
      );
    }

    let updateData: any = {};
    
    switch (action) {
      case 'mark_read':
        updateData.isRead = true;
        updateData.readAt = new Date();
        break;
      case 'mark_unread':
        updateData.isRead = false;
        updateData.readAt = null;
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    const updatedNotifications = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId: context!.userId // Ensure user can only update their own notifications
      },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      message: `${updatedNotifications.count} notifications updated`,
      count: updatedNotifications.count
    });

  } catch (error) {
    console.error('Failed to update notifications:', error);
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}