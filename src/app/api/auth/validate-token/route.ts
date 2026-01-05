import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

// Route permission mappings
const ROUTE_PERMISSIONS = {
  '/dashboard': null, // No specific permission required
  '/dashboard/tables': 'tables:read',
  '/dashboard/kitchen': 'orders:kitchen',
  '/dashboard/staff': 'staff:read',
  '/dashboard/analytics': 'analytics:read',
  '/dashboard/settings': 'settings:read',
  '/api/orders': 'orders:read',
  '/api/tables': 'tables:read',
  '/api/admin/staff': 'staff:read',
  '/api/staff/analytics': 'analytics:read',
  '/api/menu': 'menu:read',
  '/api/analytics': 'analytics:read',
} as const;

/**
 * Get required permission for a specific route
 */
function getRequiredPermission(pathname: string): string | null {
  // Find the most specific route match
  const routes = Object.keys(ROUTE_PERMISSIONS).sort(
    (a, b) => b.length - a.length
  );

  for (const route of routes) {
    if (pathname.startsWith(route)) {
      return ROUTE_PERMISSIONS[route as keyof typeof ROUTE_PERMISSIONS];
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { token, pathname } = await request.json();

    if (!token) {
      return NextResponse.json(
        { isValid: false, error: 'No token provided' },
        { status: 400 }
      );
    }

    // Validate token using RBAC system
    const validation = await AuthServiceV2.validateToken(token);

    if (!validation.isValid || !validation.payload) {
      return NextResponse.json(
        {
          isValid: false,
          error: validation.error || 'Token validation failed',
        },
        { status: 401 }
      );
    }

    const payload = validation.payload;

    // Check route permissions if pathname is provided
    if (pathname) {
      const requiredPermission = getRequiredPermission(pathname);
      if (requiredPermission) {
        if (!payload.permissions.includes(requiredPermission)) {
          return NextResponse.json(
            {
              isValid: false,
              error: `Insufficient permissions for ${pathname}`,
            },
            { status: 403 }
          );
        }
      }
    }

    // Return successful validation with payload
    return NextResponse.json({
      isValid: true,
      payload,
      user: validation.user,
      session: validation.session,
    });
  } catch (error) {
    console.error('Token validation API error:', error);
    return NextResponse.json(
      { isValid: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
