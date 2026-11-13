/**
 * Shared error mapping for the promotion owner routes.
 *
 * Kept out of `route.ts` because Next.js only permits the documented route
 * exports from a route module.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RBACError } from '@/lib/rbac/types';
import {
  PromotionNotFoundError,
  PromotionValidationError,
} from '@/lib/services/loyalty-promotion-service';
import { OwnerIdempotencyMismatchError } from '@/lib/services/loyalty-owner-idempotency';

export function handlePromotionRouteError(
  error: unknown,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
): NextResponse {
  console.error(`[Promotions] ${method} failed`);

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid promotion',
        code: 'PROMOTION_INVALID',
        details: error.issues.map((issue) => issue.message),
      },
      { status: 400 }
    );
  }

  if (error instanceof PromotionValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof PromotionNotFoundError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof OwnerIdempotencyMismatchError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof RBACError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error) {
    if (error.message.includes('Authentication required')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    if (error.message.includes('Permission denied')) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to manage promotions',
          code: 'PERMISSION_DENIED',
        },
        { status: 403 }
      );
    }
  }

  return NextResponse.json(
    { success: false, error: 'Failed to process the promotion request' },
    { status: 500 }
  );
}
