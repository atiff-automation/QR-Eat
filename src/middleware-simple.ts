/**
 * Simple Middleware - RBAC Edition
 * 
 * Following CLAUDE.md principles:
 * - Type Safety: Proper TypeScript types
 * - Error Handling: Comprehensive error scenarios  
 * - RBAC Integration: Centralized authentication
 * - Audit Logging: Security event tracking
 * - Performance: Fast path optimization
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from './lib/rbac/auth-service';
import { AuditLogger } from './lib/rbac/audit-logger';
import type { EnhancedAuthenticatedUser } from './lib/rbac/types';
import { SECURITY_HEADERS } from './lib/auth';

/**
 * Main middleware function
 * Handles authentication and adds security headers
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Step 1: Apply security headers to all responses
  applySecurityHeaders(response);

  const pathname = request.nextUrl.pathname;

  // Step 2: Check if route requires authentication
  const routeType = classifyRoute(pathname);

  if (routeType === 'public') {
    return response;
  }

  // Step 3: Validate RBAC token
  const authResult = await validateRBACTokenMiddleware(request);

  // Step 4: Handle unauthenticated requests
  if (!authResult.authenticated) {
    return handleUnauthenticated(request, pathname, routeType, response);
  }

  // Step 5: Add user context headers for authenticated requests
  if (authResult.user && routeType === 'protected_api') {
    addUserContextHeaders(response, authResult.user);
  }

  return response;
}

/**
 * Apply security headers to response
 * @internal
 */
function applySecurityHeaders(response: NextResponse): void {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
}

/**
 * Classify route type for authentication requirements
 * @internal
 */
function classifyRoute(pathname: string): 'public' | 'protected_api' | 'admin_dashboard' {
  // Public routes (no auth required)
  const publicRoutes = ['/', '/qr', '/api/health', '/test-login.html', '/test', '/simple-login'];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Protected API routes (require auth)
  const protectedApiPrefixes = ['/api/auth', '/api/staff', '/api/orders', '/api/menu'];
  const isProtectedApi = protectedApiPrefixes.some(
    (prefix) => pathname.startsWith(prefix) && pathname !== '/api/auth/login'
  );

  // Admin/dashboard routes (require auth + redirect)
  const isAdminDashboard = pathname.startsWith('/admin') || pathname.startsWith('/dashboard');

  if (isPublicRoute && !isProtectedApi && !isAdminDashboard) {
    return 'public';
  }

  if (isProtectedApi) {
    return 'protected_api';
  }

  if (isAdminDashboard) {
    return 'admin_dashboard';
  }

  return 'public'; // Default to public for unknown routes
}

/**
 * Validate RBAC token from middleware
 * @internal
 */
async function validateRBACTokenMiddleware(
  request: NextRequest
): Promise<{ authenticated: boolean; user?: EnhancedAuthenticatedUser }> {
  const token = request.cookies.get('qr_rbac_token')?.value;

  if (!token) {
    return { authenticated: false };
  }

  try {
    const validation = await AuthServiceV2.validateToken(token);

    if (validation.isValid && validation.user) {
      return { authenticated: true, user: validation.user };
    }

    // Invalid token - log for security monitoring
    await AuditLogger.logSecurityEvent(
      'anonymous',
      'MIDDLEWARE_INVALID_TOKEN',
      'low',
      'Middleware encountered invalid RBAC token',
      {
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          path: request.nextUrl.pathname,
          method: request.method
        }
      }
    );

    return { authenticated: false };
  } catch (error) {
    // Log unexpected errors
    console.error('Middleware RBAC validation error:', error);

    await AuditLogger.logSecurityEvent(
      'system',
      'MIDDLEWARE_ERROR',
      'high',
      `Middleware validation error: ${error instanceof Error ? error.message : 'Unknown'}`,
      {
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          path: request.nextUrl.pathname,
          error: error instanceof Error ? error.stack : String(error)
        }
      }
    );

    return { authenticated: false };
  }
}

/**
 * Handle unauthenticated requests based on route type
 * @internal
 */
function handleUnauthenticated(
  request: NextRequest,
  pathname: string,
  routeType: string,
  response: NextResponse
): NextResponse {
  if (routeType === 'protected_api') {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: response.headers }
    );
  }

  if (routeType === 'admin_dashboard') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

/**
 * Add user context headers to response for downstream API routes
 * @internal
 */
function addUserContextHeaders(response: NextResponse, user: EnhancedAuthenticatedUser): void {
  response.headers.set('x-user-id', user.id);
  response.headers.set('x-user-type', user.currentRole.userType);
  response.headers.set('x-user-email', user.email);
  response.headers.set('x-is-admin', (user.currentRole.userType === 'platform_admin').toString());

  // Add restaurant context if available
  if (user.restaurantContext?.id) {
    response.headers.set('x-restaurant-id', user.restaurantContext.id);
    response.headers.set('x-restaurant-slug', user.restaurantContext.slug);
  }

  // Add owner context for restaurant owners
  if (user.currentRole.userType === 'restaurant_owner') {
    response.headers.set('x-owner-id', user.id);
  }

  // Add permissions as JSON string
  response.headers.set('x-user-permissions', JSON.stringify(user.permissions));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
