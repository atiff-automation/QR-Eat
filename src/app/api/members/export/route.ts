/**
 * GET /api/members/export
 *
 * The marketing-opted-in list export described by §18.20.9/D10. Requires
 * `members:export` (owner only); a caller without `members:pii` receives
 * masked phones. The CSV is streamed; no file is written. The audit row targets
 * the literal `marketing-opt-in-list`.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  hasPermission,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import {
  exportMarketingMembers,
  marketingMembersToCsv,
} from '@/lib/services/loyalty-member-service';
import { handleMemberRouteError } from '@/app/api/members/_lib/member-route-error';

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'members', 'export');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Restaurant context is required',
          code: 'RESTAURANT_CONTEXT_REQUIRED',
        },
        { status: 400 }
      );
    }
    await requireRestaurantAccess(restaurantId, context!);

    const url = new URL(request.url);
    const result = await exportMarketingMembers({
      restaurantId,
      actorId: context!.userId,
      actorType: context!.userType,
      purpose: url.searchParams.get('purpose'),
      revealPhone: hasPermission(context!, 'members', 'pii'),
    });

    const csv = marketingMembersToCsv(result.rows);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(csv));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="loyalty-marketing-members.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleMemberRouteError(error, 'GET marketing export');
  }
}
