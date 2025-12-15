/**
 * Debug Authentication Endpoint
 * DEVELOPMENT ONLY - Provides authentication debugging information
 * 
 * SECURITY: This endpoint is disabled in production
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService, AUTH_CONSTANTS } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // SECURITY: Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    );
  }

  try {
    console.log('Debug Auth Route - Starting...');
    console.log('Request pathname:', request.nextUrl.pathname);

    // Check headers from middleware
    const headers = Object.fromEntries(request.headers.entries());
    console.log('Request headers starting with x-:', Object.keys(headers).filter(h => h.startsWith('x-')));

    // Check for token directly - try all user-type specific cookies
    const ownerToken = request.cookies.get(AUTH_CONSTANTS.OWNER_COOKIE_NAME)?.value;
    const staffToken = request.cookies.get(AUTH_CONSTANTS.STAFF_COOKIE_NAME)?.value;
    const adminToken = request.cookies.get(AUTH_CONSTANTS.ADMIN_COOKIE_NAME)?.value;
    const legacyToken = request.cookies.get(AUTH_CONSTANTS.COOKIE_NAME)?.value;

    console.log('🔍 Cookie Debug:', {
      ownerToken: ownerToken ? `${ownerToken.substring(0, 20)}...` : 'NONE',
      staffToken: staffToken ? `${staffToken.substring(0, 20)}...` : 'NONE',
      adminToken: adminToken ? `${adminToken.substring(0, 20)}...` : 'NONE',
      legacyToken: legacyToken ? `${legacyToken.substring(0, 20)}...` : 'NONE'
    });

    const token = ownerToken || staffToken || adminToken || legacyToken ||
      AuthService.extractTokenFromHeader(request.headers.get('authorization'));

    console.log('Token found:', !!token);
    console.log('Request URL:', request.url);
    console.log('Pathname:', request.nextUrl.pathname);

    // Check route classification (simulate middleware logic)
    const pathname = request.nextUrl.pathname;
    const protectedApiRoutes = [
      '/api/staff',
      '/api/orders',
      '/api/menu',
      '/api/restaurants',
      '/api/subscriptions',
      '/api/analytics',
      '/api/reports',
      '/api/billing',
      '/api/debug-auth',
    ];
    const isProtectedApiRoute = protectedApiRoutes.some(
      (route) => pathname.startsWith(route)
    );

    console.log('Is protected route:', isProtectedApiRoute);

    if (token) {
      console.log('Token length:', token.length);

      // Verify token
      const payload = AuthService.verifyToken(token);
      console.log('Token valid:', !!payload);

      if (payload) {
        console.log('Payload keys:', Object.keys(payload));
        console.log('User ID:', payload.userId);
        console.log('User Type:', payload.userType);
      }
    }

    // Check middleware headers
    const tenantHeaders = {
      'x-user-id': request.headers.get('x-user-id'),
      'x-user-type': request.headers.get('x-user-type'),
      'x-user-email': request.headers.get('x-user-email'),
      'x-is-admin': request.headers.get('x-is-admin'),
      'x-restaurant-id': request.headers.get('x-restaurant-id'),
      'x-has-token': request.headers.get('x-has-token'),
      'x-token-verified': request.headers.get('x-token-verified'),
      'x-token-error': request.headers.get('x-token-error'),
      'x-has-jwt-secret': request.headers.get('x-has-jwt-secret'),
      'x-token-length': request.headers.get('x-token-length'),
    };

    return NextResponse.json({
      success: true,
      debug: {
        pathname,
        isProtectedApiRoute,
        hasToken: !!token,
        tokenLength: token?.length || 0,
        payload: token ? AuthService.verifyToken(token) : null,
        middlewareHeaders: tenantHeaders,
        allHeaders: Object.keys(headers).filter(h => h.startsWith('x-')),
      }
    });

  } catch (error) {
    console.error('Debug auth error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}