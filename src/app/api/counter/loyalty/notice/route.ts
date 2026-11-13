import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { RBACError } from '@/lib/rbac/types';
import { getCounterLoyaltyNotice } from '@/lib/services/loyalty-notice-service';

/**
 * GET /api/counter/loyalty/notice
 *
 * Returns the server-derived rewards notice (version/text/hash, privacy URL,
 * terms) so the Counter can capture consent before attaching a member.
 *
 * Requires `loyalty:attach` and a Counter account. Tenant scope comes only from
 * the authenticated context, never from the path or a header. Loyalty being
 * off is a normal `200` with `enabled: false` and `notice: null`, not an error.
 * The response carries no member data.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'loyalty', 'attach');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const { enabled, notice } = await getCounterLoyaltyNotice(restaurantId);

    return NextResponse.json({ success: true, enabled, notice });
  } catch (error) {
    console.error('[CounterLoyaltyNotice] Error');

    if (error instanceof RBACError) {
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
          {
            success: false,
            error: error.message,
            code: 'PERMISSION_DENIED',
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to load the loyalty notice' },
      { status: 500 }
    );
  }
}
