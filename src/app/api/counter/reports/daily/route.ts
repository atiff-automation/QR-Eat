import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { getCounterDailyTotals } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const requestedDays = Number(url.searchParams.get('days') || 7);
    const days = Number.isFinite(requestedDays)
      ? Math.min(Math.max(Math.trunc(requestedDays), 1), 31)
      : 7;
    const rows = await getCounterDailyTotals(access.value.restaurantId, days);
    return NextResponse.json({
      success: true,
      days,
      asOf: new Date().toISOString(),
      rows,
    });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load daily totals');
  }
}
