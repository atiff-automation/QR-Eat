/**
 * POST /api/members/{id}/withdraw-consent
 *
 * `scope=LOYALTY` stops visit accrual/reward resolution and clears marketing;
 * `scope=MARKETING` clears marketing only. Both are idempotent, audited and
 * take an `Idempotency-Key` (§18.20.7, §18.20.14 B). Financial rows and
 * `phoneHash` are retained.
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
  ConsentWithdrawalScopeSchema,
  withdrawMemberConsent,
} from '@/lib/services/loyalty-member-service';
import {
  handleMemberRouteError,
  invalidRequestResponse,
  isMemberId,
  memberNotFoundResponse,
} from '@/app/api/members/_lib/member-route-error';

const WithdrawBodySchema = z.object({
  scope: ConsentWithdrawalScopeSchema,
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'members', 'consent_withdraw');

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
    const parsed = WithdrawBodySchema.safeParse(body);
    if (!parsed.success) {
      return invalidRequestResponse(
        parsed.error.issues.map((issue) => issue.message)
      );
    }

    const result = await withdrawMemberConsent({
      restaurantId,
      actorId: context!.userId,
      actorType: context!.userType,
      memberId: id,
      scope: parsed.data.scope,
      revealPhone: hasPermission(context!, 'members', 'pii'),
      idempotencyKey,
    });

    return NextResponse.json(
      {
        success: true,
        member: result.member,
        scope: result.scope,
      },
      {
        status: result.statusCode,
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    return handleMemberRouteError(error, 'POST withdraw-consent');
  }
}
