import { NextRequest, NextResponse } from 'next/server';
import { AuthService, SECURITY_HEADERS, UserType, verifyAuthToken, AUTH_CONSTANTS } from './lib/auth';
import { 
  getSubdomainInfo, 
  shouldHandleSubdomain, 
  getRestaurantSlugFromSubdomain,
  logSubdomainInfo,
  isReservedSubdomain
} from './lib/subdomain';

// Force middleware to run in Node.js runtime to support crypto module
export const runtime = 'nodejs';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Apply security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  const pathname = request.nextUrl.pathname;
  
  // Log subdomain info in development
  if (process.env.NODE_ENV === 'development') {
    logSubdomainInfo(request);
  }

  // Handle subdomain routing first (but skip for restaurant-not-found page)
  if (shouldHandleSubdomain(request) && !pathname.includes('/restaurant-not-found')) {
    return await handleSubdomainRouting(request, response);
  }

  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/qr',
    '/api/health',
    '/test-login.html',
    '/test',
    '/simple-login',
  ];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // API routes that require authentication
  const protectedApiRoutes = [
    '/api/auth',
    '/api/staff',
    '/api/orders',
    '/api/menu',
    '/api/restaurants',
    '/api/debug-auth',
  ];
  const isProtectedApiRoute = protectedApiRoutes.some(
    (route) => pathname.startsWith(route) && pathname !== '/api/auth/login'
  );

  // Admin dashboard routes
  const isAdminRoute =
    pathname.startsWith('/admin') || pathname.startsWith('/dashboard');

  if (isPublicRoute && !isProtectedApiRoute && !isAdminRoute) {
    return response;
  }

  // Check for authentication token
  const token = request.cookies.get(AUTH_CONSTANTS.COOKIE_NAME)?.value;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 Middleware Token Debug:', {
      pathname,
      hasToken: !!token,
      tokenLength: token?.length,
      cookieName: AUTH_CONSTANTS.COOKIE_NAME,
      isAdminRoute,
      isDashboardRoute: pathname.startsWith('/dashboard')
    });
  }

  if (!token) {
    if (isProtectedApiRoute) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: response.headers }
      );
    }

    if (isAdminRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Note: Password change check moved to client-side due to Edge Runtime limitations
  // The mustChangePassword check is now handled in the dashboard components

  // Token verification for admin routes is handled by dashboard components
  // This ensures proper error handling and user experience
  if (token && isAdminRoute) {
    // Dashboard components will verify token and handle invalid tokens appropriately
    return response;
  }

  // Add basic token indicator for API routes (token verification will be done in API routes)
  if (token && isProtectedApiRoute) {
    response.headers.set('x-has-token', 'true');
  }

  return response;
}

/**
 * Handle subdomain-specific routing logic
 */
async function handleSubdomainRouting(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const subdomain = getRestaurantSlugFromSubdomain(request);
  
  if (!subdomain) {
    // No valid subdomain found, redirect to main domain
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = request.headers.get('host')?.replace(/^[^.]+\./, '') || 'localhost:3000';
    const mainDomainUrl = new URL('/', `${protocol}://${host}`);
    return NextResponse.redirect(mainDomainUrl);
  }

  // Check if subdomain is reserved
  if (isReservedSubdomain(subdomain)) {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = request.headers.get('host')?.replace(/^[^.]+\./, '') || 'localhost:3000';
    const mainDomainUrl = new URL('/', `${protocol}://${host}`);
    return NextResponse.redirect(mainDomainUrl);
  }

  try {
    // For subdomain routing, we need to validate the restaurant exists
    // We'll do a simpler check here and let the pages handle full tenant resolution
    
    // For now, allow all valid subdomains to continue
    // The actual tenant validation will happen in the API routes and page components

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
    const host = request.headers.get('host')?.replace(/^[^.]+\./, '') || 'localhost:3000';
    const mainDomainUrl = new URL('/', `${protocol}://${host}`);
    return NextResponse.redirect(mainDomainUrl);
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
