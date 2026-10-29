import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { getCounterDaySummary } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const businessDayId = url.searchParams.get('businessDayId') || undefined;
    const summary = await getCounterDaySummary(
      access.value.restaurantId,
      businessDayId
    );
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load day report');
  }
}
