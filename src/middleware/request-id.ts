import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware to inject x-request-id into the request and response headers.
 * Following CLAUDE.md principles for observability and traceability.
 */
export function requestIdMiddleware(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  // Check if request-id already exists (from proxy/load balancer)
  let requestId = request.headers.get('x-request-id');

  if (!requestId) {
    // Generate new UUID for the request
    requestId = crypto.randomUUID();
  }

  // Set in request headers (for downstream middleware/routes)
  request.headers.set('x-request-id', requestId);

  // Set in response headers (for client/observability)
  response.headers.set('x-request-id', requestId);

  return response;
}
