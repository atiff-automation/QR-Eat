/**
 * GET /api/members/{id}
 *
 * Tenant-scoped member profile. Requires `members:read`. The full E.164 phone
 * is returned only with `members:pii`, and that read is audited with actor,
 * target, purpose and timestamp (§18.20.14 A). A member from another restaurant
 * is a 404, never a 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  hasPermission,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { deleteMember, getMember } from '@/lib/services/loyalty-member-service';
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

    if (!isMemberId(id)) return memberNotFoundResponse();

    const url = new URL(request.url);
    const result = await getMember({
      restaurantId,
      actorId: context!.userId,
      actorType: context!.userType,
      memberId: id,
      purpose: url.searchParams.get('purpose'),
      revealPhone: hasPermission(context!, 'members', 'pii'),
    });

    return NextResponse.json({ success: true, member: result.member });
  } catch (error) {
    return handleMemberRouteError(error, 'GET profile');
  }
}

/**
 * DELETE /api/members/{id}
 *
 * Anonymises the member in place. Requires `members:delete` (owner only) and
 * an `Idempotency-Key`. Nulls `Customer.phone`/`name` and the order copies
 * (`Order.customerName`/`customerPhone`, REVIEW-05 F-05), keeps `phoneHash`
 * and every financial row, and writes an audit row (§18.20.9).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'members', 'delete');

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

    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Idempotency-Key header is required',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        },
        { status: 400 }
      );
    }

    const result = await deleteMember({
      restaurantId,
      actorId: context!.userId,
      actorType: context!.userType,
      memberId: id,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        success: true,
        member: result.member,
        ordersAnonymised: result.ordersAnonymised,
      },
      {
        status: result.statusCode,
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    return handleMemberRouteError(error, 'DELETE member');
  }
}
