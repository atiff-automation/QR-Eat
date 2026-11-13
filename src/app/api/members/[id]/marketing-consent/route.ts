/**
 * POST /api/members/{id}/marketing-consent
 *
 * Records a marketing opt-in with the authenticated actor and the
 * server-derived notice version/hash. Forbidden when loyalty consent was
 * withdrawn, when loyalty consent was never recorded, or when the member is
 * `ANONYMIZED` (§18.20.14 B). Takes an `Idempotency-Key` and is audited.
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
import { recordMarketingConsent } from '@/lib/services/loyalty-member-service';
import {
  handleMemberRouteError,
  invalidRequestResponse,
  isMemberId,
  memberNotFoundResponse,
} from '@/app/api/members/_lib/member-route-error';

const MarketingConsentBodySchema = z
  .object({ purpose: z.string().trim().max(200).optional() })
  .optional();

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

    const body = await request.json().catch(() => ({}));
    const parsed = MarketingConsentBodySchema.safeParse(body);
    if (!parsed.success) {
      return invalidRequestResponse(
        parsed.error.issues.map((issue) => issue.message)
      );
    }

    const result = await recordMarketingConsent({
      restaurantId,
      actorId: context!.userId,
      actorType: context!.userType,
      memberId: id,
      purpose: parsed.data?.purpose,
      revealPhone: hasPermission(context!, 'members', 'pii'),
      idempotencyKey,
    });

    return NextResponse.json(
      {
        success: true,
        member: result.member,
        noticeVersion: result.noticeVersion,
      },
      {
        status: result.statusCode,
        headers: result.replayed ? { 'Idempotent-Replay': 'true' } : undefined,
      }
    );
  } catch (error) {
    return handleMemberRouteError(error, 'POST marketing-consent');
  }
}
