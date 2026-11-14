/**
 * Shared error mapping and id validation for the owner member routes.
 *
 * Kept out of `route.ts` because Next.js only permits the documented route
 * exports from a route module.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RBACError } from '@/lib/rbac/types';
import {
  OwnerIdempotencyMismatchError,
  OwnerMutationConflictError,
} from '@/lib/services/loyalty-owner-idempotency';
import {
  MemberConfigurationError,
  MemberNotFoundError,
  MemberStateError,
  MemberValidationError,
} from '@/lib/services/loyalty-member-service';

const uuidSchema = z.string().uuid();

export function isMemberId(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export function memberNotFoundResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Member not found', code: 'NOT_FOUND' },
    { status: 404 }
  );
}

export function invalidRequestResponse(details?: string[]): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'Invalid member request',
      code: 'INVALID_REQUEST',
      ...(details && details.length > 0 ? { details } : {}),
    },
    { status: 400 }
  );
}

export function handleMemberRouteError(
  error: unknown,
  action: string
): NextResponse {
  // Deliberately does not log the error object: it can carry Prisma arguments
  // or a request body, and member requests contain PII.
  console.error(`[Members] ${action} failed`);

  if (error instanceof z.ZodError) {
    return invalidRequestResponse(error.issues.map((issue) => issue.message));
  }

  if (error instanceof MemberValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof MemberNotFoundError) {
    return memberNotFoundResponse();
  }

  if (error instanceof MemberStateError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof MemberConfigurationError) {
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

  if (error instanceof OwnerMutationConflictError) {
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
          error: 'You do not have permission to manage members',
          code: 'PERMISSION_DENIED',
        },
        { status: 403 }
      );
    }
  }

  return NextResponse.json(
    { success: false, error: 'Failed to process the member request' },
    { status: 500 }
  );
}
