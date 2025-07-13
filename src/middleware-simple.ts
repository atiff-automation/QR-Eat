import { NextRequest, NextResponse } from 'next/server';
import { AuthService, SECURITY_HEADERS, UserType } from './lib/auth';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Apply security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  const pathname = request.nextUrl.pathname;

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
  const token = request.cookies.get('qr_auth_token')?.value;

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

  // For now, if there's a token, assume it's valid
  // We'll verify it properly in the API routes or page components
  if (token && isAdminRoute) {
    // Let the dashboard handle token verification
    return response;
  }

  // Add user context to request headers for API routes (if token exists)
  if (token && isProtectedApiRoute) {
    // Verify token and add tenant context headers
    const payload = AuthService.verifyToken(token);
    if (payload) {
      response.headers.set('x-user-id', payload.userId);
      response.headers.set('x-user-type', payload.userType);
      response.headers.set('x-user-email', payload.email);
      response.headers.set('x-is-admin', (payload.userType === UserType.PLATFORM_ADMIN).toString());
      
      if (payload.restaurantId) {
        response.headers.set('x-restaurant-id', payload.restaurantId);
      }
      if (payload.ownerId) {
        response.headers.set('x-owner-id', payload.ownerId);
      }
      
      // Add permissions as JSON string
      response.headers.set('x-user-permissions', JSON.stringify(payload.permissions));
    } else {
      response.headers.set('x-has-token', 'true');
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
