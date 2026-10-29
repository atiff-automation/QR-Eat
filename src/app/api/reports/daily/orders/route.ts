import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { getDailyOrdersReport } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'date=YYYY-MM-DD is required' },
        { status: 400 }
      );
    }
    const report = await getDailyOrdersReport(access.value.restaurantId, date);
    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load daily orders');
  }
}
