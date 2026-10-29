import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { getClosedBusinessDay } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const { id } = await params;
    const result = await getClosedBusinessDay(access.value.restaurantId, id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load Z report');
  }
}
