import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { getCounterBlockerOrders } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    if (!type) {
      return NextResponse.json(
        { success: false, error: 'type is required' },
        { status: 400 }
      );
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 50);
    const result = await getCounterBlockerOrders(
      access.value.restaurantId,
      type,
      {
        offset: Number.isFinite(offset) ? offset : 0,
        limit: Number.isFinite(limit) ? limit : 50,
      }
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load blocker orders');
  }
}
