import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    console.log('Debug Auth Route - Starting...');
    console.log('Request pathname:', request.nextUrl.pathname);

    // Check headers from middleware
    const headers = Object.fromEntries(request.headers.entries());
    console.log('Request headers starting with x-:', Object.keys(headers).filter(h => h.startsWith('x-')));

    // Check for token directly
    const token = request.cookies.get('qr_auth_token')?.value ||
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