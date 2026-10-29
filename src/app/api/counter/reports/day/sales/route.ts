import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { getCounterSalesPage } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const businessDayId = url.searchParams.get('businessDayId') || undefined;
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 30);
    const page = await getCounterSalesPage(access.value.restaurantId, {
      businessDayId,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 30,
    });
    return NextResponse.json({ success: true, ...page });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load sales');
  }
}
