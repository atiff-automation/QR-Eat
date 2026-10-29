import { NextRequest, NextResponse } from 'next/server';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import {
  CounterDayOrderScope,
  getCounterDayOrders,
} from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

const SCOPES: CounterDayOrderScope[] = [
  'all',
  'history',
  'completed',
  'open',
  'unpaid',
  'cancelled',
];

export async function GET(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const requestedScope = url.searchParams.get('scope') || 'all';
    if (!SCOPES.includes(requestedScope as CounterDayOrderScope)) {
      return NextResponse.json(
        { success: false, error: 'Invalid scope' },
        { status: 400 }
      );
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    const limitParam = url.searchParams.get('limit');
    const report = await getCounterDayOrders(access.value.restaurantId, {
      scope: requestedScope as CounterDayOrderScope,
      paymentStatus: url.searchParams.get('paymentStatus') || undefined,
      q: url.searchParams.get('q') || undefined,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: limitParam ? Number(limitParam) : undefined,
      allDates:
        url.searchParams.get('allDates') === 'true' ||
        url.searchParams.get('allDates') === '1',
    });
    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to load day orders');
  }
}
