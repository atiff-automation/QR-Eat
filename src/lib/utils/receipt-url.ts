/**
 * Receipt URL Utilities
 *
 * Following CLAUDE.md principles:
 * - Single Responsibility
 * - No Hardcoding
 * - Type Safety
 */

import { getBaseUrl } from '@/lib/url-config';
import type { NextRequest } from 'next/server';

/**
 * Build public receipt URL for customer access
 *
 * @param receiptNumber - Receipt number (e.g., RCP-20240108-123456-789)
 * @param restaurantId - Restaurant UUID
 * @param request - Optional NextRequest for base URL detection (server-side)
 * @returns Full URL to public receipt page
 */
export function buildPublicReceiptUrl(
  receiptNumber: string,
  restaurantId: string,
  request?: NextRequest
): string {
  // Client-side: use window.location
  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location;
    return `${protocol}//${host}/receipt/${restaurantId}/${receiptNumber}`;
  }

  // Server-side: use getBaseUrl
  const baseUrl = getBaseUrl(request);
  return `${baseUrl}/receipt/${restaurantId}/${receiptNumber}`;
}
