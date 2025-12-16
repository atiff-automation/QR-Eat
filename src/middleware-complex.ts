/**
 * Complex Middleware - RBAC Edition  
 * 
 * Following CLAUDE.md principles:
 * - Type Safety: Proper TypeScript types
 * - Error Handling: Comprehensive error scenarios
 * - RBAC Integration: Centralized authentication
 * - Audit Logging: Security event tracking
 * - Strict Validation: Always validates tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from './lib/rbac/auth-service';
import { AuditLogger } from './lib/rbac/audit-logger';
import type { EnhancedAuthenticatedUser } from './lib/rbac/types';
import { SECURITY_HEADERS } from './lib/auth';

/**
 * Complex middleware with strict token validation
 * Unlike simple middleware, this ALWAYS validates tokens when present
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Step 1: Apply security headers
  applySecurityHeaders(response);

  const pathname = request.nextUrl.pathname;

  // Step 2: Classify route
  const routeType = classifyRoute(pathname);

  if (routeType === 'public') {
    return response;
  }

  // Step 3: Validate token (required for protected routes)
  const authResult = await validateRBACToken(request);

  // Step 4: Handle authentication failures
  if (!authResult.authenticated || !authResult.user) {
    return handleAuthenticationFailure(request, pathname, routeType, response, authResult.error);
  }

  // Step 5: Add user context headers
  if (routeType === 'protected_api') {
    addStrictUserContextHeaders(response, authResult.user);
  }

  return response;
}

/**
 * Apply security headers
 * @internal
 */
function applySecurityHeaders(response: NextResponse): void {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
}

/**
 * Classify route type
 * @internal
 */
function classifyRoute(pathname: string): 'public' | 'protected_api' | 'admin_dashboard' {
  const publicRoutes = ['/', '/qr', '/api/health'];
  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const protectedApiPrefixes = ['/api/auth', '/api/staff', '/api/orders', '/api/menu'];
  const isProtectedApi = protectedApiPrefixes.some(
    (prefix) => pathname.startsWith(prefix) && pathname !== '/api/auth/login'
  );

  const isAdminDashboard = pathname.startsWith('/admin') || pathname.startsWith('/dashboard');

  if (isPublic && !isProtectedApi && !isAdminDashboard) {
    return 'public';
  }

  if (isProtectedApi) {
    return 'protected_api';
  }

  if (isAdminDashboard) {
    return 'admin_dashboard';
  }

  return 'public';
}

/**
 * Validate RBAC token with strict checking
 * @internal
 */
async function validateRBACToken(
  request: NextRequest
): Promise<{
  authenticated: boolean;
  user?: EnhancedAuthenticatedUser;
  error?: 'missing_token' | 'invalid_token' | 'validation_error';
}> {
  const token = request.cookies.get('qr_rbac_token')?.value;

  if (!token) {
    return { authenticated: false, error: 'missing_token' };
  }

  try {
    const validation = await AuthServiceV2.validateToken(token);

    if (!validation.isValid || !validation.user) {
      // Log invalid token attempts
      await AuditLogger.logSecurityEvent(
        'anonymous',
        'MIDDLEWARE_COMPLEX_INVALID_TOKEN',
        'medium',
        'Complex middleware rejected invalid RBAC token',
        {
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          metadata: {
            path: request.nextUrl.pathname,
            method: request.method,
            hasToken: true
          }
        }
      );

      return { authenticated: false, error: 'invalid_token' };
    }

    return { authenticated: true, user: validation.user };
  } catch (error) {
    console.error('Complex middleware validation error:', error);

    // Log unexpected errors
    await AuditLogger.logSecurityEvent(
      'system',
      'MIDDLEWARE_COMPLEX_ERROR',
      'high',
      `Complex middleware error: ${error instanceof Error ? error.message : 'Unknown'}`,
      {
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          path: request.nextUrl.pathname,
          error: error instanceof Error ? error.stack : String(error)
        }
      }
    );

    return { authenticated: false, error: 'validation_error' };
  }
}

/**
 * Handle authentication failures with appropriate responses
 * @internal
 */
function handleAuthenticationFailure(
  request: NextRequest,
  pathname: string,
  routeType: string,
  response: NextResponse,
  errorType: 'missing_token' | 'invalid_token' | 'validation_error' | undefined
): NextResponse {
  const errorMessage = errorType === 'invalid_token' || errorType === 'validation_error'
    ? 'Invalid or expired token'
    : 'Authentication required';

  if (routeType === 'protected_api') {
    return NextResponse.json(
      { error: errorMessage },
      { status: 401, headers: response.headers }
    );
  }

  if (routeType === 'admin_dashboard') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

/**
 * Add strict user context headers for API routes
 * @internal
 */
function addStrictUserContextHeaders(response: NextResponse, user: EnhancedAuthenticatedUser): void {
  // Core user identity
  response.headers.set('x-user-id', user.id);
  response.headers.set('x-user-type', user.currentRole.userType);
  response.headers.set('x-user-email', user.email);
  response.headers.set('x-is-admin', (user.currentRole.userType === 'platform_admin').toString());

  // Staff-specific headers (for backward compatibility with complex middleware)
  if (user.currentRole.userType === 'staff') {
    response.headers.set('x-staff-id', user.id);
    response.headers.set('x-role-id', user.currentRole.id);
  }

  // Restaurant context
  if (user.restaurantContext?.id) {
    response.headers.set('x-restaurant-id', user.restaurantContext.id);
    response.headers.set('x-restaurant-slug', user.restaurantContext.slug);
  }

  // Owner context
  if (user.currentRole.userType === 'restaurant_owner') {
    response.headers.set('x-owner-id', user.id);
  }

  // Permissions
  response.headers.set('x-user-permissions', JSON.stringify(user.permissions));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
  runtime: 'nodejs',
};
