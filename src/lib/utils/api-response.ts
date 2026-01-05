import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

/**
 * Standard API Response Structure
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
  requestId?: string;
}

/**
 * Helper to get the request ID from headers
 */
export async function getRequestId(): Promise<string | undefined> {
  try {
    const headersList = await headers();
    return headersList.get('x-request-id') || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Send a standardized success response
 */
export async function sendSuccess<T>(data: T, status: number = 200) {
  const requestId = await getRequestId();

  const response: ApiResponse<T> = {
    success: true,
    data,
    requestId,
  };

  return NextResponse.json(response, { status });
}

/**
 * Send a standardized error response
 */
export async function sendError(
  message: string,
  code: string = 'INTERNAL_ERROR',
  status: number = 500,
  details?: unknown
) {
  const requestId = await getRequestId();

  const response: ApiResponse = {
    success: false,
    error: {
      message,
      code,
      details,
    },
    requestId,
  };

  return NextResponse.json(response, { status });
}
