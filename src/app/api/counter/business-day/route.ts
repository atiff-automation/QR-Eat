import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import {
  getCounterDaySummary,
  getOpenBusinessDay,
} from '@/lib/services/reporting/counter-report-service';
import { parseBusinessDateFromDb } from '@/lib/time/business-day';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const day = await getOpenBusinessDay(access.value.restaurantId);
    const summary = await getCounterDaySummary(
      access.value.restaurantId,
      day.id
    );
    return NextResponse.json({
      success: true,
      businessDay: {
        id: day.id,
        businessDate: parseBusinessDateFromDb(day.businessDate),
        status: day.status,
        openedAt: day.openedAt.toISOString(),
        closedAt: day.closedAt?.toISOString() ?? null,
        zNumber: day.zNumber,
      },
      summary,
    });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load business day');
  }
}
