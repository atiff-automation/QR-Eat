/**
 * RBAC Authentication Middleware - Single Source of Truth for Auth
 *
 * This middleware provides centralized authentication and authorization
 * for API routes. Following CODING_STANDARDS.md:
 * - Single Responsibility: Each function has one clear purpose
 * - DRY: Reusable auth logic extracted to one place
 * - Type Safety: Full TypeScript type support
 * - No Hardcoding: Uses permission constants
 *
 * @example
 * ```typescript
 * import { requireAuth } from '@/lib/rbac/middleware';
 * import { STAFF_PERMISSIONS } from '@/lib/rbac/permission-constants';
 *
 * export async function GET(request: NextRequest) {
 *   const auth = await requireAuth(request, [STAFF_PERMISSIONS.READ]);
 *   if (!auth.success) {
 *     return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
 *   }
 *   // Use auth.user and auth.payload
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from './auth-service';
import { PermissionManager } from './permissions';
import {
  EnhancedAuthenticatedUser,
  EnhancedJWTPayload,
  RBACError,
} from './types';
import { Permission } from './permission-constants';

/**
 * Authentication result returned by middleware
 */
export interface AuthResult {
  success: boolean;
  user?: EnhancedAuthenticatedUser;
  payload?: EnhancedJWTPayload;
  permissions?: string[];
  error?: string;
  statusCode?: number;
}

/**
 * Authentication options for fine-grained control
 */
export interface AuthOptions {
  /** Required permissions (user must have at least one) */
  requiredPermissions?: string[];
  /** Required permissions (user must have all) */
  requiredAllPermissions?: string[];
  /** Allow requests without authentication (for optional auth) */
  optional?: boolean;
}

/**
 * Token cookie name in the RBAC system
 */
const RBAC_TOKEN_COOKIE = 'qr_rbac_token';

/**
 * Legacy token cookie names (for backward compatibility during migration)
 */
const LEGACY_COOKIE_NAMES = [
  'qr_auth_token',
  'qr_owner_token',
  'qr_staff_token',
  'qr_admin_token',
];

/**
 * Extract JWT token from request
 * Checks multiple sources in priority order:
 * 1. RBAC token cookie (preferred)
 * 2. Authorization header (Bearer token)
 * 3. Legacy cookies (backward compatibility)
 *
 * @param request - Next.js request object
 * @returns JWT token string or null if not found
 */
export function extractToken(request: NextRequest): string | null {
  // 1. Try RBAC token cookie first (preferred method)
  const rbacToken = request.cookies.get(RBAC_TOKEN_COOKIE)?.value;
  if (rbacToken) {
    return rbacToken;
  }

  // 2. Try Authorization header (Bearer token)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 3. Try legacy cookies (backward compatibility during migration)
  for (const cookieName of LEGACY_COOKIE_NAMES) {
    const legacyToken = request.cookies.get(cookieName)?.value;
    if (legacyToken) {
      return legacyToken;
    }
  }

  return null;
}

/**
 * Authenticate request and validate token
 * Returns user info and permissions without checking specific permissions
 *
 * @param request - Next.js request object
 * @returns Authentication result with user and permissions
 */
export async function authenticate(request: NextRequest): Promise<AuthResult> {
  try {
    // Extract token
    const token = extractToken(request);
    if (!token) {
      return {
        success: false,
        error: 'Authentication required',
        statusCode: 401,
      };
    }

    // Validate token using AuthServiceV2
    const validation = await AuthServiceV2.validateToken(token);
    if (!validation.isValid || !validation.payload || !validation.user) {
      return {
        success: false,
        error: validation.error || 'Invalid authentication token',
        statusCode: 401,
      };
    }

    return {
      success: true,
      user: validation.user,
      payload: validation.payload,
      permissions: validation.payload.permissions,
    };
  } catch (error) {
    if (error instanceof RBACError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode,
      };
    }

    return {
      success: false,
      error: 'Authentication failed',
      statusCode: 500,
    };
  }
}

/**
 * Require authentication with optional permission checks
 * Main middleware function for protecting API routes
 *
 * @param request - Next.js request object
 * @param requiredPermissions - Array of required permissions (user needs at least one)
 * @param options - Additional authentication options
 * @returns Authentication result
 *
 * @example Simple authentication
 * ```typescript
 * const auth = await requireAuth(request);
 * ```
 *
 * @example With permissions (ANY)
 * ```typescript
 * const auth = await requireAuth(request, [STAFF_PERMISSIONS.READ, STAFF_PERMISSIONS.WRITE]);
 * ```
 *
 * @example With permissions (ALL)
 * ```typescript
 * const auth = await requireAuth(request, [], {
 *   requiredAllPermissions: [STAFF_PERMISSIONS.READ, STAFF_PERMISSIONS.WRITE]
 * });
 * ```
 */
export async function requireAuth(
  request: NextRequest,
  requiredPermissions: string[] = [],
  options: Omit<AuthOptions, 'requiredPermissions'> = {}
): Promise<AuthResult> {
  // Authenticate user
  const authResult = await authenticate(request);

  // If authentication failed and not optional, return error
  if (!authResult.success) {
    if (options.optional) {
      return { success: true }; // Allow through without auth
    }
    return authResult;
  }

  // If no permission requirements, return success
  const hasPermissionRequirements =
    requiredPermissions.length > 0 ||
    (options.requiredAllPermissions &&
      options.requiredAllPermissions.length > 0);

  if (!hasPermissionRequirements) {
    return authResult;
  }

  // Check permissions
  const userPermissions = authResult.permissions || [];

  // Check "any" permissions
  if (requiredPermissions.length > 0) {
    const hasPermission = PermissionManager.hasAnyPermission(
      userPermissions,
      requiredPermissions
    );
    if (!hasPermission) {
      return {
        success: false,
        error: `Missing required permission. Need one of: ${requiredPermissions.join(', ')}`,
        statusCode: 403,
      };
    }
  }

  // Check "all" permissions
  if (
    options.requiredAllPermissions &&
    options.requiredAllPermissions.length > 0
  ) {
    const hasAllPermissions = PermissionManager.hasAllPermissions(
      userPermissions,
      options.requiredAllPermissions
    );
    if (!hasAllPermissions) {
      return {
        success: false,
        error: `Missing required permissions. Need all of: ${options.requiredAllPermissions.join(', ')}`,
        statusCode: 403,
      };
    }
  }

  return authResult;
}

/**
 * Create an unauthorized response
 * Helper for consistent error responses
 *
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 401)
 * @returns Next.js response with error
 */
export function unauthorizedResponse(
  message: string = 'Authentication required',
  statusCode: number = 401
): NextResponse {
  return NextResponse.json({ error: message }, { status: statusCode });
}

/**
 * Check if user has specific permission
 * Utility for inline permission checks
 *
 * @param authResult - Authentication result from requireAuth
 * @param permission - Permission to check
 * @returns True if user has permission
 */
export function hasPermission(
  authResult: AuthResult,
  permission: Permission | string
): boolean {
  if (!authResult.success || !authResult.permissions) {
    return false;
  }
  return PermissionManager.hasPermission(authResult.permissions, permission);
}

/**
 * Check if user has any of the specified permissions
 *
 * @param authResult - Authentication result from requireAuth
 * @param permissions - Array of permissions to check
 * @returns True if user has at least one permission
 */
export function hasAnyPermission(
  authResult: AuthResult,
  permissions: (Permission | string)[]
): boolean {
  if (!authResult.success || !authResult.permissions) {
    return false;
  }
  return PermissionManager.hasAnyPermission(
    authResult.permissions,
    permissions
  );
}

/**
 * Check if user has all specified permissions
 *
 * @param authResult - Authentication result from requireAuth
 * @param permissions - Array of permissions to check
 * @returns True if user has all permissions
 */
export function hasAllPermissions(
  authResult: AuthResult,
  permissions: (Permission | string)[]
): boolean {
  if (!authResult.success || !authResult.permissions) {
    return false;
  }
  return PermissionManager.hasAllPermissions(
    authResult.permissions,
    permissions
  );
}
