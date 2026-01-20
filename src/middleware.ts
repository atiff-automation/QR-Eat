import { NextRequest, NextResponse } from 'next/server';
import {
  shouldHandleSubdomain,
  getRestaurantSlugFromSubdomain,
  logSubdomainInfo,
  isReservedSubdomain,
} from '@/lib/subdomain';
import { AUTH_ROUTES } from '@/lib/auth-routes';
import { requestIdMiddleware } from '@/middleware/request-id';
import { getMainDomain } from '@/lib/config/domains';

/**
 * Get security headers based on request context
 * @param request - Next.js request object
 * @returns Security headers object
 */
function getSecurityHeaders(request: NextRequest): Record<string, string> {
  const isSubdomain = shouldHandleSubdomain(request);

  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
  };

  try {
    const mainDomain = getMainDomain();

    if (isSubdomain) {
      // Only main domain can frame subdomains
      headers['Content-Security-Policy'] =
        `frame-ancestors 'self' https://${mainDomain}`;
    } else {
      headers['Content-Security-Policy'] = `frame-ancestors 'self'`;
    }
  } catch (error) {
    console.error('[Middleware] Failed to get main domain for CSP:', error);
    // Fallback to safe default
    headers['Content-Security-Policy'] = `frame-ancestors 'self'`;
  }

  return headers;
}

export async function middleware(request: NextRequest) {
  try {
    let response = NextResponse.next();

    // ✅ Phase 1: Request ID Tracking
    response = requestIdMiddleware(request, response);

    // ✅ PRODUCTION: Apply dynamic security headers with error handling
    try {
      const securityHeaders = getSecurityHeaders(request);
      Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    } catch (headerError) {
      console.error(
        '[Middleware] Failed to set security headers:',
        headerError
      );
      // Continue with default headers rather than crashing
    }

    const pathname = request.nextUrl.pathname;

    // ✅ PRODUCTION: Add CORS for public APIs
    if (
      pathname.startsWith('/api/menu/') ||
      pathname.startsWith('/api/qr/') ||
      pathname.startsWith('/api/receipt/')
    ) {
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set(
        'Access-Control-Allow-Methods',
        'GET, POST, OPTIONS'
      );
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }

    // Basic middleware logging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Middleware running for:', pathname);
    }

    // Log subdomain info in development
    if (process.env.NODE_ENV === 'development') {
      logSubdomainInfo(request);
    }

    // Handle subdomain routing first (but skip for restaurant-not-found page)
    if (
      shouldHandleSubdomain(request) &&
      !pathname.includes('/restaurant-not-found')
    ) {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '🌐 RBAC Middleware: Handling subdomain routing for',
          pathname
        );
      }
      return await handleSubdomainRouting(request, response);
    }

    // Skip middleware for public routes
    if (isPublicRoute(pathname)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🚪 RBAC Middleware: Skipping public route', pathname);
      }
      return response;
    }

    // Skip middleware for API routes that don't require auth
    if (isPublicApiRoute(pathname)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🚪 RBAC Middleware: Skipping public API route', pathname);
      }
      return response;
    }

    // Get authentication token
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🚫 RBAC Middleware: No token found for', pathname);
      }
      return redirectToLogin(request, pathname);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(
        '🔑 RBAC Middleware: Token found, validating via API for',
        pathname
      );
    }

    try {
      // For production Edge Runtime, we cannot fetch internal routes
      // Instead, we validate JWT directly using jose (Edge-compatible)
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || 'fallback-secret-for-development'
      );

      try {
        const { payload } = await jwtVerify(token, secret, {
          issuer: 'qr-restaurant-system',
        });

        // Add user context to request headers for downstream processing
        if (payload) {
          response.headers.set('x-user-id', payload.userId as string);
          response.headers.set('x-user-email', payload.email as string);
          response.headers.set(
            'x-user-role',
            (payload.currentRole as Record<string, unknown>)
              ?.roleTemplate as string
          );
          response.headers.set(
            'x-user-type',
            (payload.currentRole as Record<string, unknown>)?.userType as string
          );
          response.headers.set(
            'x-user-permissions',
            JSON.stringify(payload.permissions)
          );
          response.headers.set('x-session-id', payload.sessionId as string);
          response.headers.set(
            'x-is-admin',
            (
              (payload.currentRole as Record<string, unknown>)?.roleTemplate ===
              'platform_admin'
            ).toString()
          );

          if (payload.restaurantContext) {
            const restaurantContext = payload.restaurantContext as Record<
              string,
              unknown
            >;
            response.headers.set(
              'x-restaurant-id',
              restaurantContext.id as string
            );
            response.headers.set(
              'x-restaurant-slug',
              restaurantContext.slug as string
            );

            if (
              (payload.currentRole as Record<string, unknown>)?.roleTemplate ===
              'restaurant_owner'
            ) {
              response.headers.set('x-owner-id', payload.userId as string);
            }
          }
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(
            '✅ RBAC Middleware: Token validation successful for',
            pathname
          );
        }

        return response;
      } catch (jwtError) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🚫 RBAC Middleware: JWT verification failed:', jwtError);
        }
        return redirectToLogin(request, pathname);
      }
    } catch (error) {
      console.error('Middleware error:', error);
      return redirectToLogin(request, pathname);
    }
  } catch (error) {
    console.error('[Middleware] Critical error:', error);
    // ✅ PRODUCTION: Fail-safe - return basic response instead of crashing
    return NextResponse.next();
  }
}

/**
 * Handle subdomain-specific routing logic
 */
async function handleSubdomainRouting(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  const subdomain = getRestaurantSlugFromSubdomain(request);
  const pathname = request.nextUrl.pathname;
  const currentHost = request.headers.get('host') || '';

  try {
    const mainDomain = getMainDomain();

    // ✅ PRODUCTION: Prevent redirect loops
    if (currentHost === mainDomain) {
      return response;
    }

    if (!subdomain) {
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      return NextResponse.redirect(`${protocol}://${mainDomain}`);
    }

    // Check if subdomain is reserved
    if (isReservedSubdomain(subdomain)) {
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      return NextResponse.redirect(`${protocol}://${mainDomain}`);
    }

    // ✅ PRODUCTION: Redirect ALL API calls to main domain
    if (pathname.startsWith('/api/')) {
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const redirectUrl = new URL(pathname, `${protocol}://${mainDomain}`);
      redirectUrl.search = request.nextUrl.search;

      // ✅ PRODUCTION: Log redirect for debugging (development only)
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[Subdomain Security] API redirect: ${currentHost}${pathname} → ${redirectUrl}`
        );
      }

      return NextResponse.redirect(redirectUrl);
    }

    // ✅ PRODUCTION: Redirect internal routes to main domain
    if (!isPublicRoute(pathname)) {
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const redirectUrl = new URL(pathname, `${protocol}://${mainDomain}`);

      // ✅ PRODUCTION: Log redirect for debugging (development only)
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[Subdomain Security] Internal route redirect: ${currentHost}${pathname} → ${redirectUrl}`
        );
      }

      return NextResponse.redirect(redirectUrl);
    }

    // Public routes: Handle normally
    if (pathname === '/') {
      const menuUrl = new URL(`/restaurant/${subdomain}`, request.url);
      return NextResponse.rewrite(menuUrl);
    }

    // ✅ CRITICAL FIX: Pass tenant slug to page via request headers
    // Clone request headers and add tenant information
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-slug', subdomain);
    requestHeaders.set('x-is-subdomain', 'true');

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Subdomain Routing] Setting headers for ${pathname}:`, {
        subdomain,
        pathname,
        isPublicRoute: isPublicRoute(pathname),
      });
    }

    // Return response with modified request headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error('[Subdomain Routing] Error:', error);
    // Fail-safe: redirect to main domain on error
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'tabtep.app';
    return NextResponse.redirect(`${protocol}://${mainDomain}`);
  }
}

/**
 * Check if a route is public and doesn't require authentication
 */
function isPublicRoute(pathname: string): boolean {
  const publicRoutes = [
    '/',
    AUTH_ROUTES.LOGIN,
    AUTH_ROUTES.REGISTER,
    AUTH_ROUTES.FORGOT_PASSWORD,
    AUTH_ROUTES.RESET_PASSWORD,
    AUTH_ROUTES.STAFF_PASSWORD_HELP,
    '/qr/',
    '/menu/',
    '/restaurant/',
    '/receipt/', // Public receipt access for customers
    '/_next/',
    '/favicon.ico',
    '/manifest.webmanifest', // PWA manifest
    '/test-login.html',
    '/test',
    '/simple-login',
  ];

  // Exact match for root path, startsWith for others
  if (pathname === '/') {
    return true;
  }

  return publicRoutes.slice(1).some((route) => pathname.startsWith(route));
}

/**
 * Check if an API route is public and doesn't require authentication
 */
function isPublicApiRoute(pathname: string): boolean {
  const publicApiRoutes = [
    '/api/auth/login',
    '/api/auth/rbac-login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/refresh', // Allow token refresh even with expired token
    '/api/auth/staff-password-request',
    '/api/auth/validate-token', // Our new validation endpoint
    '/api/qr/',
    '/api/menu/',
    '/api/health',
    '/api/subdomain/',
    '/api/webhooks/', // Webhook handlers (external services)
    '/api/orders/', // Public order status tracking (order ID acts as security token)
    '/api/receipt/', // Public receipt access for customers
  ];

  return publicApiRoutes.some((route) => pathname.startsWith(route));
}

/**
 * Redirect to login page with return URL
 *
 * Following CLAUDE.md principles:
 * - Single Responsibility: Handle authentication failures appropriately
 * - Type Safety: Proper TypeScript usage
 * - Error Handling: Different responses for API vs page routes
 *
 * API routes receive JSON error responses (401)
 * Page routes receive HTML redirects to login page
 */
function redirectToLogin(
  request: NextRequest,
  currentPath?: string
): NextResponse {
  // API routes must return JSON, not HTML redirects
  // This prevents "Unexpected token '<'" errors when frontend expects JSON
  if (currentPath?.startsWith('/api/')) {
    return NextResponse.json(
      {
        success: false,
        error: 'Authentication required',
      },
      { status: 401 }
    );
  }

  // Page routes get redirected to login as usual
  const redirectUrl = new URL(AUTH_ROUTES.LOGIN, request.url);
  if (currentPath && currentPath !== AUTH_ROUTES.LOGIN) {
    redirectUrl.searchParams.set('redirect', currentPath);
  }
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
