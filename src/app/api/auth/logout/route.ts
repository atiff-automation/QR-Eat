/**
 * RBAC-Enhanced Logout Endpoint
 * 
 * This endpoint provides logout functionality using the new RBAC system,
 * properly cleaning up sessions and tokens.
 * 
 * Implements Phase 5.2.1 of RBAC Implementation Plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    // Get authentication token - Use RBAC token primarily
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value || // Fallback for transition period
                  request.cookies.get('qr_owner_token')?.value ||
                  request.cookies.get('qr_staff_token')?.value ||
                  request.cookies.get('qr_admin_token')?.value;

    if (!token) {
      // If no token, still return success (user might already be logged out)
      const response = NextResponse.json({ message: 'Logged out successfully' });
      
      // Clear any existing cookies
      const allCookies = [
        'qr_rbac_token',
        'qr_auth_token',
        'qr_owner_token',
        'qr_staff_token',
        'qr_admin_token'
      ];

      allCookies.forEach(cookieName => {
        response.cookies.set({
          name: cookieName,
          value: '',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 0,
          path: '/',
        });
      });

      return response;
    }

    // Get client information for audit
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Validate token using RBAC system
    const validation = await AuthServiceV2.validateToken(token);
    
    if (validation.isValid && validation.payload) {
      // Logout using RBAC system
      await AuthServiceV2.logout(validation.payload.sessionId, {
        ipAddress: clientIP,
        userAgent
      });

      // Development logging
      if (process.env.NODE_ENV === 'development') {
        console.log('🔒 RBAC Logout successful:', {
          userId: validation.payload.userId,
          sessionId: validation.payload.sessionId,
          userType: validation.payload.currentRole.userType
        });
      }
    } else {
      // Token might be invalid/expired, but we still want to clear cookies
      // Log the logout attempt anyway
      await AuditLogger.logSecurityEvent(
        'anonymous',
        'LOGOUT_WITH_INVALID_TOKEN',
        'low',
        'Logout attempted with invalid or expired token',
        {
          ipAddress: clientIP,
          userAgent,
          metadata: {
            endpoint: 'logout',
            logoutTime: new Date().toISOString()
          }
        }
      );
    }

    const response = NextResponse.json({ message: 'Logged out successfully' });

    // Clear RBAC authentication cookie
    response.cookies.set({
      name: 'qr_rbac_token',
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    // Clear any legacy authentication cookies
    const legacyCookies = [
      'qr_auth_token',
      'qr_owner_token',
      'qr_staff_token',
      'qr_admin_token'
    ];

    legacyCookies.forEach(cookieName => {
      response.cookies.set({
        name: cookieName,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
    });

    return response;
  } catch (error) {
    console.error('RBAC Logout error:', error);
    
    // Even if there's an error, clear cookies and return success
    const response = NextResponse.json({ message: 'Logged out successfully' });
    
    // Clear all possible authentication cookies
    const allCookies = [
      'qr_rbac_token',
      'qr_auth_token',
      'qr_owner_token',
      'qr_staff_token',
      'qr_admin_token'
    ];

    allCookies.forEach(cookieName => {
      response.cookies.set({
        name: cookieName,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
    });

    return response;
  }
}
