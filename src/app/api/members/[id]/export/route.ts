/**
 * GET /api/members/{id}/export
 *
 * Subject-access export for one member. The member need not be
 * marketing-opted-in. Requires `members:export` (owner only); a caller without
 * `members:pii` receives a masked phone. The CSV is streamed; no file is
 * written. The audit row targets the member id.
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
  exportMember,
  memberToCsv,
} from '@/lib/services/loyalty-member-service';
import {
  handleMemberRouteError,
  isMemberId,
  memberNotFoundResponse,
} from '@/app/api/members/_lib/member-route-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    if (!isMemberId(id)) return memberNotFoundResponse();

    const url = new URL(request.url);
    const result = await exportMember({
      restaurantId,
      actorId: context!.userId,
      actorType: context!.userType,
      memberId: id,
      purpose: url.searchParams.get('purpose'),
      revealPhone: hasPermission(context!, 'members', 'pii'),
    });

    const csv = memberToCsv(result.member);
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
        'Content-Disposition': `attachment; filename="member-${id}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleMemberRouteError(error, 'GET member export');
  }
}
