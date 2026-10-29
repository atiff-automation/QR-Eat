import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { closeCounterBusinessDay } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

const CloseSchema = z.object({
  countedCash: z.number().min(0),
  notes: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Idempotency-Key header is required',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        },
        { status: 400 }
      );
    }
    const body = CloseSchema.parse(await request.json());
    const result = await closeCounterBusinessDay({
      restaurantId: access.value.restaurantId,
      countedCash: body.countedCash,
      notes: body.notes,
      idempotencyKey,
      closedBy: access.value.context.userId,
      closedByName: access.value.context.email,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid close request',
          code: 'INVALID_CLOSE_REQUEST',
          details: error.issues,
        },
        { status: 400 }
      );
    }
    return counterReportErrorResponse(error, 'Failed to close business day');
  }
}
