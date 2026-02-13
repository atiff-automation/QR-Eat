/**
 * Authentication Utilities for Mobile Client Support
 *
 * Provides helper functions to extract authentication tokens from
 * query parameters, enabling mobile clients (React Native) that
 * cannot use httpOnly cookies to authenticate with API endpoints.
 *
 * Used by: SSE, kitchen orders, item status, categories, preferences APIs
 */

import { NextRequest } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import type { TenantContext } from '@/lib/tenant-context';
import { UserType } from '@/lib/tenant-context';

/**
 * Extract and validate a JWT token from the ?token= query parameter.
 *
 * Returns a TenantContext if a valid token is found in the query string,
 * or null if no query token is present (allowing fallback to cookie auth).
 *
 * @param request - Next.js request object
 * @returns TenantContext or null
 */
export async function extractTokenFromRequest(
  request: NextRequest
): Promise<TenantContext | null> {
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');

  if (!tokenParam) {
    return null;
  }

  const authResult = await AuthServiceV2.validateToken(tokenParam);

  if (!authResult.isValid || !authResult.user) {
    return null;
  }

  const user = authResult.user;

  // Convert permissions array to resource:action map
  const permissions: Record<string, string[]> = {};
  for (const perm of user.permissions) {
    if (typeof perm === 'string' && perm.includes(':')) {
      const [resource, action] = perm.split(':', 2);
      if (!permissions[resource]) {
        permissions[resource] = [];
      }
      permissions[resource].push(action);
    }
  }

  return {
    userId: user.id,
    userType: user.currentRole.userType as UserType,
    email: user.email,
    restaurantId: user.restaurantContext?.id || user.currentRole.restaurantId,
    ownerId:
      user.currentRole.userType === 'restaurant_owner' ? user.id : undefined,
    permissions,
    isAdmin: user.currentRole.userType === 'platform_admin',
    restaurantSlug: user.restaurantContext?.slug,
    roleTemplate: user.currentRole.roleTemplate,
  };
}

/**
 * Extract a raw JWT token from query parameter, cookies, or Authorization header.
 *
 * Returns the token string for use with AuthServiceV2.validateToken().
 * Checks ?token= query param first, then falls back to cookies, then Authorization header.
 *
 * @param request - Next.js request object
 * @returns JWT token string or null
 */
export function getTokenFromRequest(request: NextRequest): string | null {
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');

  if (tokenParam) {
    return tokenParam;
  }

  // Check cookies
  const cookieToken =
    request.cookies.get('qr_rbac_token')?.value ||
    request.cookies.get('qr_auth_token')?.value;

  if (cookieToken) {
    return cookieToken;
  }

  // Check Authorization header (for mobile apps)
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  return null;
}
