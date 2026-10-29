import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { listClosedBusinessDays } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || 30);
    const rows = await listClosedBusinessDays(
      access.value.restaurantId,
      Number.isFinite(limit) ? limit : 30
    );
    return NextResponse.json({ success: true, rows });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load Z reports');
  }
}
