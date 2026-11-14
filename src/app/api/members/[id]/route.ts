/**
 * GET / PATCH / DELETE /api/members/{id}
 *
 * Tenant-scoped member profile. GET requires `members:read`; the full E.164
 * phone is returned only with `members:pii`, and that read is audited with
 * actor, target, purpose and timestamp (§18.20.14 A). A member from another
 * restaurant is a 404, never a 403.
 *
 * PATCH renames the member behind `members:pii` (P7d); the QR and Counter
 * attach paths stay write-once. DELETE anonymises behind `members:delete`.
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
import {
  deleteMember,
  getMember,
  MEMBER_NAME_MAX_LENGTH,
  renameMember,
} from '@/lib/services/loyalty-member-service';
import {
  handleMemberRouteError,
  invalidRequestResponse,
  isMemberId,
  memberNotFoundResponse,
} from '@/app/api/members/_lib/member-route-error';

/**
 * `name: null` clears the name. The value is trimmed before the 80-character
 * bound is applied, so leading/trailing spaces do not count.
 */
const RenameBodySchema = z.object({
  name: z
    .string()
    .trim()
    .max(
      MEMBER_NAME_MAX_LENGTH,
      `A member name can be at most ${MEMBER_NAME_MAX_LENGTH} characters`
    )
    .nullable(),
});

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
 * PATCH /api/members/{id}
 *
 * Owner rename behind `members:pii` (P7d). The body is `{ name: string | null }`
 * (trimmed, max 80 characters; `null` clears it). Requires an
 * `Idempotency-Key`. A cross-tenant member is a 404; an `ANONYMIZED` member is
 * rejected because there is nothing to rename. The audit row is written in the
 * same transaction and never contains the old or new name.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'members', 'pii');

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidRequestResponse(['A JSON body is required']);
    }
    const parsed = RenameBodySchema.safeParse(body);
    if (!parsed.success) {
      return invalidRequestResponse(
        parsed.error.issues.map((issue) => issue.message)
      );
    }

    const result = await renameMember({
      restaurantId,
      actorId: context!.userId,
      actorType: context!.userType,
      memberId: id,
      name: parsed.data.name,
      revealPhone: hasPermission(context!, 'members', 'pii'),
      idempotencyKey,
    });

    return NextResponse.json(
      { success: true, member: result.member },
      {
        status: result.statusCode,
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    return handleMemberRouteError(error, 'PATCH member');
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
