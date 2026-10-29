import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
  TenantContext,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { CounterReportError } from '@/lib/services/reporting/counter-report-service';

export interface CounterReportingContext {
  context: TenantContext;
  restaurantId: string;
}

export async function getCounterReportingContext(
  request: NextRequest
): Promise<
  | { ok: true; value: CounterReportingContext }
  | { ok: false; response: NextResponse }
> {
  const context = await getTenantContext(request);
  const denied = counterAccessDenied(context);
  if (denied) return { ok: false, response: denied };

  try {
    const authenticated = requireAuth(context);
    requirePermission(authenticated, 'analytics', 'read');
    const isManager =
      authenticated.userType === 'restaurant_owner' ||
      (authenticated.userType === 'staff' &&
        authenticated.roleTemplate === 'manager');
    if (!isManager) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            error: 'Reports are available to managers and owners only',
            code: 'REPORT_ACCESS_DENIED',
          },
          { status: 403 }
        ),
      };
    }
    if (!authenticated.restaurantId) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            error: 'Restaurant context is required',
            code: 'RESTAURANT_REQUIRED',
          },
          { status: 400 }
        ),
      };
    }
    return {
      ok: true,
      value: {
        context: authenticated,
        restaurantId: authenticated.restaurantId,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication')) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        ),
      };
    }
    if (error instanceof Error && error.message.includes('Permission denied')) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            error: 'Reports are available to managers and owners only',
            code: 'REPORT_ACCESS_DENIED',
          },
          { status: 403 }
        ),
      };
    }
    throw error;
  }
}

export function counterReportErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CounterReportError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }
  if (error instanceof Error && error.message.includes('Authentication')) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }
  if (error instanceof Error && error.message.includes('Permission denied')) {
    return NextResponse.json(
      { success: false, error: 'Permission denied' },
      { status: 403 }
    );
  }
  console.error(`[CounterReports] ${fallback}:`, error);
  return NextResponse.json(
    { success: false, error: fallback },
    { status: 500 }
  );
}
