/**
 * Receipt URL Utilities
 *
 * Following CLAUDE.md principles:
 * - Single Responsibility
 * - No Hardcoding
 * - Type Safety
 */

import { buildSubdomainUrl } from '@/lib/config/domains';

/**
 * Build public receipt URL for customer access
 *
 * @param receiptNumber - Receipt number (e.g., RCP-20240108-123456-789)
 * @param slug - Restaurant slug (e.g., 'marios')
 * @returns Full URL to public receipt page on subdomain
 */
export function buildPublicReceiptUrl(
  receiptNumber: string,
  slug: string
): string {
  return buildSubdomainUrl(slug, `/receipt/${receiptNumber}`);
}
