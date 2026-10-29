import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { startClosingBusinessDay } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;
  try {
    const summary = await startClosingBusinessDay(access.value.restaurantId);
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to start close');
  }
}
