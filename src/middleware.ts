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
    // Validate token by calling our validation API route
    const validationUrl = new URL('/api/auth/validate-token', request.url);
    const validationResponse = await fetch(validationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({ token, pathname }),
    });

    if (!validationResponse.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '🚫 RBAC Middleware: Token validation failed for',
          pathname
        );
      }
      return redirectToLogin(request, pathname);
    }

    const validationData = await validationResponse.json();

    if (!validationData.isValid) {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '🚫 RBAC Middleware: Token validation returned invalid for',
          pathname
        );
      }
      return redirectToLogin(request, pathname);
    }

    // Add user context to request headers for downstream processing
    const payload = validationData.payload;
    if (payload) {
      response.headers.set('x-user-id', payload.userId);
      response.headers.set('x-user-email', payload.email);
      response.headers.set('x-user-role', payload.currentRole.roleTemplate);
      response.headers.set('x-user-type', payload.currentRole.userType);
      response.headers.set(
        'x-user-permissions',
        JSON.stringify(payload.permissions)
      );
      response.headers.set('x-session-id', payload.sessionId);
      response.headers.set(
        'x-is-admin',
        (payload.currentRole.roleTemplate === 'platform_admin').toString()
      );

      if (payload.restaurantContext) {
        response.headers.set('x-restaurant-id', payload.restaurantContext.id);
        response.headers.set(
          'x-restaurant-slug',
          payload.restaurantContext.slug
        );

        if (payload.currentRole.roleTemplate === 'restaurant_owner') {
          response.headers.set('x-owner-id', payload.userId);
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
 */
function redirectToLogin(
  request: NextRequest,
  currentPath?: string
): NextResponse {
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
