import { NextRequest, NextResponse } from 'next/server';
import {
  shouldHandleSubdomain,
  getRestaurantSlugFromSubdomain,
  logSubdomainInfo,
  isReservedSubdomain,
} from '@/lib/subdomain';

// Security headers for all responses
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
} as const;

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Apply security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  const pathname = request.nextUrl.pathname;

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
}

/**
 * Handle subdomain-specific routing logic
 */
async function handleSubdomainRouting(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  const subdomain = getRestaurantSlugFromSubdomain(request);

  if (!subdomain) {
    // No valid subdomain found, redirect to main domain
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host =
      request.headers.get('host')?.replace(/^[^.]+\./, '') || 'localhost:3000';
    const mainDomainUrl = new URL('/', `${protocol}://${host}`);
    return NextResponse.redirect(mainDomainUrl);
  }

  // Check if subdomain is reserved
  if (isReservedSubdomain(subdomain)) {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host =
      request.headers.get('host')?.replace(/^[^.]+\./, '') || 'localhost:3000';
    const mainDomainUrl = new URL('/', `${protocol}://${host}`);
    return NextResponse.redirect(mainDomainUrl);
  }

  try {
    const pathname = request.nextUrl.pathname;

    // Handle subdomain-specific routing
    if (pathname === '/') {
      // Root path for subdomain should show restaurant's customer menu
      const menuUrl = new URL(`/restaurant/${subdomain}`, request.url);
      return NextResponse.rewrite(menuUrl);
    }

    // Add tenant context headers for all subdomain requests
    response.headers.set('x-tenant-slug', subdomain);
    response.headers.set('x-is-subdomain', 'true');

    return response;
  } catch (error) {
    console.error('Error in subdomain routing:', error);

    // On critical subdomain error, redirect to main domain for security
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host =
      request.headers.get('host')?.replace(/^[^.]+\./, '') || 'localhost:3000';
    const mainDomainUrl = new URL('/', `${protocol}://${host}`);
    return NextResponse.redirect(mainDomainUrl);
  }
}

/**
 * Check if a route is public and doesn't require authentication
 */
function isPublicRoute(pathname: string): boolean {
  const publicRoutes = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/staff-password-help',
    '/qr/',
    '/menu/',
    '/restaurant/',
    '/_next/',
    '/favicon.ico',
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
    '/api/auth/staff-password-request',
    '/api/auth/validate-token', // Our new validation endpoint
    '/api/qr/',
    '/api/menu/',
    '/api/health',
    '/api/subdomain/',
    '/api/webhooks/', // Webhook handlers (external services)
    '/api/orders/', // Public order status tracking (order ID acts as security token)
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
  const redirectUrl = new URL('/login', request.url);
  if (currentPath && currentPath !== '/login') {
    redirectUrl.searchParams.set('redirect', currentPath);
  }
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
