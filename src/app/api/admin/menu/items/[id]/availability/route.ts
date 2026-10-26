import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import {
  MenuAvailabilityError,
  setMenuItemAvailability,
} from '@/lib/services/menu-availability-service';

const UpdateAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
  reason: z.enum(['sold_out', 'kitchen_unavailable', 'other']).optional(),
});

/**
 * PATCH /api/admin/menu/items/{itemId}/availability
 *
 * Narrow website entry point for the daily "86" action. Deliberately does not
 * require broad menu:write access.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;

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

    const permissions = authResult.user.permissions || [];
    if (!permissions.includes('menu:availability')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const restaurantId = authResult.user.currentRole?.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant context required' },
        { status: 403 }
      );
    }

    const body = UpdateAvailabilitySchema.parse(await request.json());
    const item = await setMenuItemAvailability({
      restaurantId,
      itemId,
      isAvailable: body.isAvailable,
      reason: body.reason,
      source: 'WEB',
      actor: {
        userId: authResult.user.id,
        userType: authResult.user.userType,
      },
      requestContext: {
        ipAddress:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
      },
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('[MenuAvailabilityUpdate] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid availability data',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    if (error instanceof MenuAvailabilityError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update menu availability' },
      { status: 500 }
    );
  }
}
