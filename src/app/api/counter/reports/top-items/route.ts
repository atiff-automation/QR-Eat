import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import {
  getCounterDaySummary,
  getCounterTopItemsLastDays,
} from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || 3);
    const days = Number(url.searchParams.get('days') || 0);
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 10)
      : 3;
    if (days > 0) {
      const items = await getCounterTopItemsLastDays(
        access.value.restaurantId,
        days,
        safeLimit
      );
      return NextResponse.json({
        success: true,
        days,
        asOf: new Date().toISOString(),
        items,
      });
    }
    const businessDayId = url.searchParams.get('businessDayId') || undefined;
    const summary = await getCounterDaySummary(
      access.value.restaurantId,
      businessDayId
    );
    return NextResponse.json({
      success: true,
      businessDate: summary.businessDate,
      asOf: summary.asOf,
      items: summary.topItems.slice(0, safeLimit),
    });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load top items');
  }
}
