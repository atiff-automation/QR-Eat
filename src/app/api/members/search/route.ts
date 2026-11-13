/**
 * POST /api/members/search
 *
 * Exact E.164 member lookup. The phone travels in the request body, never in a
 * query string, so it does not reach access logs (§18.20.9). Requires
 * `members:read`; a caller without `members:pii` receives masked phones only.
 * Every search is audited with actor and purpose.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTenantContext,
  hasPermission,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { searchMembers } from '@/lib/services/loyalty-member-service';
import {
  handleMemberRouteError,
  invalidRequestResponse,
} from '@/app/api/members/_lib/member-route-error';

const SearchBodySchema = z.object({
  phone: z.string().trim().min(1).max(32),
  purpose: z.string().trim().min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'members', 'read');

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidRequestResponse(['A JSON body is required']);
    }

    const parsed = SearchBodySchema.safeParse(body);
    if (!parsed.success) {
      return invalidRequestResponse(
        parsed.error.issues.map((issue) => issue.message)
      );
    }

    const result = await searchMembers({
      restaurantId,
      actorId: context!.userId,
      actorType: context!.userType,
      phone: parsed.data.phone,
      purpose: parsed.data.purpose,
      revealPhone: hasPermission(context!, 'members', 'pii'),
    });

    return NextResponse.json({ success: true, members: result.members });
  } catch (error) {
    return handleMemberRouteError(error, 'POST search');
  }
}
