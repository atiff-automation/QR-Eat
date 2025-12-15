/**
 * Single Notification Management API
 * Handle marking individual notifications as read/unread
 * 
 * Following CLAUDE.md principles:
 * - Type Safety: Proper TypeScript types throughout
 * - Error Handling: Comprehensive error cases
 * - RBAC Integration: Shared helpers for authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  validateRBACToken,
  createErrorResponse,
  logAccessDenied
} from '@/lib/rbac/route-helpers';
import type { EnhancedAuthenticatedUser } from '@/lib/rbac/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // RBAC Authentication with proper types
    const authResult = await validateRBACToken(request);
    if (!authResult.success || !authResult.user) {
      return createErrorResponse(
        authResult.error!.message,
        authResult.error!.status
      );
    }

    const user: EnhancedAuthenticatedUser = authResult.user;

    const { isRead } = await request.json();
    const notificationId = params.id;

    // Update notification only if it belongs to the current user
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId: user.id,
        userType: user.currentRole.userType
      }
    });

    if (!notification) {
      await logAccessDenied(
        user,
        `notification:${notificationId}`,
        'Notification not found or access denied',
        request
      );
      return createErrorResponse('Notification not found', 404);
    }

    const updatedNotification = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead,
        readAt: isRead ? new Date() : null
      }
    });

    return NextResponse.json({
      success: true,
      notification: updatedNotification
    });

  } catch (error) {
    console.error('Notification update error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}