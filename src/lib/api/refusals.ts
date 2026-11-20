/**
 * Shared HTTP refusal shapes for API routes.
 *
 * Response-only by design: this module must not import Prisma, RBAC or domain
 * services, so every route can use it without pulling authority logic into the
 * HTTP boundary.
 */

import { NextResponse } from 'next/server';

export const ORDER_NOT_FOUND_BODY = {
  success: false,
  error: 'Order not found',
  code: 'ORDER_NOT_FOUND',
} as const;

/**
 * True when an error is the authentication failure thrown by `requireAuth`
 * (`Error('Authentication required')`).
 */
export function isAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes('Authentication required')
  );
}

/** `401` with the shared authentication-required body. */
export function authenticationRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Authentication required',
      code: 'AUTHENTICATION_REQUIRED',
    },
    { status: 401 }
  );
}

/** `404` with the shared order-not-found body. */
export function orderNotFoundResponse(): NextResponse {
  return NextResponse.json(ORDER_NOT_FOUND_BODY, { status: 404 });
}
