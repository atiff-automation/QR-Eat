import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { setOpeningFloat } from '@/lib/services/reporting/counter-report-service';

export const dynamic = 'force-dynamic';

const Body = z.object({ openingFloat: z.number().min(0) });

export async function PUT(request: NextRequest) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;
  try {
    const body = Body.parse(await request.json());
    const summary = await setOpeningFloat(
      access.value.restaurantId,
      body.openingFloat
    );
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid opening float',
          details: error.issues,
        },
        { status: 400 }
      );
    }
    return counterReportErrorResponse(error, 'Failed to set opening float');
  }
}
