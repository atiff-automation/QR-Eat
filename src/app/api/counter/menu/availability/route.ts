import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { listMenuAvailability } from '@/lib/services/menu-availability-service';

/**
 * GET /api/counter/menu/availability
 *
 * Staff-only list of all active items, including unavailable ("86") items.
 * The normal Counter menu endpoint intentionally excludes unavailable items.
 */
export async function GET(request: NextRequest) {
  try {
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

    const items = await listMenuAvailability(restaurantId);

    return NextResponse.json(
      { success: true, items },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('[CounterMenuAvailability] Error:', error);
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
      {
        success: false,
        error: 'Failed to load menu availability',
      },
      { status: 500 }
    );
  }
}
