/**
 * Authentication token extraction for API routes.
 *
 * Web clients use the httpOnly RBAC cookie. Native clients (Counter, station)
 * use an Authorization: Bearer header. Tokens are deliberately not accepted
 * from the query string: URLs leak through logs, referrers and browser history.
 */

import { NextRequest } from 'next/server';

export function getTokenFromRequest(request: NextRequest): string | null {
  const cookieToken =
    request.cookies.get('qr_rbac_token')?.value ||
    request.cookies.get('qr_auth_token')?.value;

  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}
