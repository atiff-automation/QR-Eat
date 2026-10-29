import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import {
  getDailyOrdersReport,
  getOpenBusinessDay,
} from '@/lib/services/reporting/counter-report-service';
import { parseBusinessDateFromDb } from '@/lib/time/business-day';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;
  try {
    const url = new URL(request.url);
    const requestedDate = url.searchParams.get('date');
    if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return NextResponse.json(
        { success: false, error: 'date must be YYYY-MM-DD' },
        { status: 400 }
      );
    }
    const date =
      requestedDate ||
      parseBusinessDateFromDb(
        (await getOpenBusinessDay(access.value.restaurantId)).businessDate
      );
    const report = await getDailyOrdersReport(access.value.restaurantId, date);
    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load daily orders');
  }
}
