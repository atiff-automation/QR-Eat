import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import {
  MenuAvailabilityError,
  setMenuItemAvailability,
} from '@/lib/services/menu-availability-service';

const UpdateAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
  reason: z.enum(['sold_out', 'kitchen_unavailable', 'other']).optional(),
});

/**
 * PATCH /api/counter/menu/items/{itemId}/availability
 *
 * Counter staff can mark an item unavailable ("86") or restore it. The shared
 * service owns tenant validation, audit and cache invalidation.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'menu', 'availability');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const body = UpdateAvailabilitySchema.parse(await request.json());
    const item = await setMenuItemAvailability({
      restaurantId,
      itemId,
      isAvailable: body.isAvailable,
      reason: body.reason,
      source: 'COUNTER',
      actor: {
        userId: context!.userId,
        userType: context!.userType,
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
    console.error('[CounterMenuAvailabilityUpdate] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
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
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 403 }
        );
      }
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update menu availability' },
      { status: 500 }
    );
  }
}
