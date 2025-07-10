import { NextRequest, NextResponse } from 'next/server';
import { AuthService, SECURITY_HEADERS } from './lib/auth';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Apply security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  const pathname = request.nextUrl.pathname;

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/qr', '/api/health'];
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
  const token =
    request.cookies.get('qr_auth_token')?.value ||
    AuthService.extractTokenFromHeader(request.headers.get('authorization'));

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

  // Verify token
  const payload = AuthService.verifyToken(token!);
  if (!payload) {
    if (isProtectedApiRoute) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: response.headers }
      );
    }

    if (isAdminRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Add user context to request headers for API routes
  if (payload && isProtectedApiRoute) {
    response.headers.set('x-staff-id', payload.staffId);
    response.headers.set('x-restaurant-id', payload.restaurantId);
    response.headers.set('x-role-id', payload.roleId);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
