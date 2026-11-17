/**
 * GET /api/reports/loyalty
 *
 * Owner/manager loyalty report (§18.20.7, §18.20.8). Requires
 * `loyalty:report`. The range is a business-date range (`from`, `to` in
 * YYYY-MM-DD), inclusive. Every figure is tenant-scoped by `restaurantId`.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  getLoyaltyReport,
  LoyaltyReportNotFoundError,
  LoyaltyReportValidationError,
} from '@/lib/services/loyalty-report-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'loyalty', 'report');

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
    const report = await getLoyaltyReport({
      restaurantId,
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
    });

    return NextResponse.json({ success: true, report });
  } catch (error) {
    return handleLoyaltyReportError(error);
  }
}

function handleLoyaltyReportError(error: unknown): NextResponse {
  // No error object is logged: report queries must never echo PII.
  console.error('[LoyaltyReport] GET failed');

  if (error instanceof LoyaltyReportValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof LoyaltyReportNotFoundError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

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
          error: 'You do not have permission to view loyalty reports',
          code: 'PERMISSION_DENIED',
        },
        { status: 403 }
      );
    }
  }

  return NextResponse.json(
    { success: false, error: 'Failed to build the loyalty report' },
    { status: 500 }
  );
}
