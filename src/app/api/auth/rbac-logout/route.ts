/**
 * RBAC-Integrated Logout Endpoint
 *
 * This endpoint provides logout functionality using the new RBAC system,
 * properly cleaning up sessions and tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { EnhancedJWTService } from '@/lib/rbac/jwt';
import { SessionManager } from '@/lib/rbac/session-manager';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';
import { RefreshTokenService } from '@/lib/rbac/refresh-token-service';
import { getTokenFromRequest } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  try {
    // Native clients send a Bearer token and a refresh token in the body.
    // Web clients use the httpOnly cookies.
    let bodyRefreshToken: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.refreshToken === 'string') {
        bodyRefreshToken = body.refreshToken;
      }
    } catch {
      // No body is valid for cookie-based logout.
    }

    const currentToken = getTokenFromRequest(request);
    const refreshToken =
      request.cookies.get('qr_refresh_token')?.value || bodyRefreshToken;

    if (!currentToken && !refreshToken) {
      // If no tokens, still return success (user might already be logged out)
      const response = NextResponse.json({
        message: 'Logged out successfully',
      });

      // Clear any existing cookies
      const allCookies = [
        'qr_rbac_token',
        'qr_refresh_token',
        'qr_auth_token',
        'qr_owner_token',
        'qr_staff_token',
        'qr_admin_token',
      ];

      allCookies.forEach((cookieName) => {
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
    const auditContext = {
      ipAddress: clientIP,
      userAgent,
      metadata: {
        endpoint: 'rbac-logout',
        logoutTime: new Date().toISOString(),
      },
    };

    try {
      // Verify and decode access token to get user info.
      if (currentToken) {
        const tokenPayload = await EnhancedJWTService.verifyToken(currentToken);

        await SessionManager.invalidateSession(tokenPayload.sessionId);
        await AuditLogger.logLogout(
          tokenPayload.userId,
          tokenPayload.sessionId,
          auditContext
        );

        if (process.env.NODE_ENV === 'development') {
          console.log('🔒 RBAC Logout successful:', {
            userId: tokenPayload.userId,
            sessionId: tokenPayload.sessionId,
            userType: tokenPayload.currentRole.userType,
            refreshTokenRevoked: !!refreshToken,
          });
        }
      }

      // The access token can be expired on a Counter that has been idle.
      // Resolve the session from the refresh token before revoking it.
      if (refreshToken) {
        const refreshValidation =
          await RefreshTokenService.validateRefreshToken(refreshToken);
        if (refreshValidation.isValid && refreshValidation.data) {
          await SessionManager.invalidateSession(
            refreshValidation.data.sessionId
          );
        }
        await RefreshTokenService.revokeRefreshToken(
          refreshToken,
          'user_logout'
        );
      }
    } catch {
      // Token might be invalid/expired, but we still want to clear cookies.
      if (refreshToken) {
        const refreshValidation =
          await RefreshTokenService.validateRefreshToken(refreshToken);
        if (refreshValidation.isValid && refreshValidation.data) {
          await SessionManager.invalidateSession(
            refreshValidation.data.sessionId
          );
        }
        await RefreshTokenService.revokeRefreshToken(
          refreshToken,
          'logout_with_invalid_access_token'
        );
      }

      // Log the logout attempt anyway
      await AuditLogger.logSecurityEvent(
        'anonymous',
        'LOGOUT_WITH_INVALID_TOKEN',
        'low',
        'Logout attempted with invalid or expired token',
        auditContext
      );
    }

    const response = NextResponse.json({ message: 'Logged out successfully' });

    // Clear access token cookie
    response.cookies.set({
      name: 'qr_rbac_token',
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    // Clear refresh token cookie
    response.cookies.set({
      name: 'qr_refresh_token',
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
      'qr_admin_token',
    ];

    legacyCookies.forEach((cookieName) => {
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
      'qr_admin_token',
    ];

    allCookies.forEach((cookieName) => {
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

// Logout all sessions for current user
export async function DELETE(request: NextRequest) {
  try {
    // Get current token from cookie
    const currentToken = request.cookies.get('qr_rbac_token')?.value;

    if (!currentToken) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 }
      );
    }

    // Get client information for audit
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const auditContext = {
      ipAddress: clientIP,
      userAgent,
      metadata: {
        endpoint: 'rbac-logout-all',
        logoutAllTime: new Date().toISOString(),
      },
    };

    try {
      // Verify and decode token to get user info
      const tokenPayload = await EnhancedJWTService.verifyToken(currentToken);

      // Invalidate all sessions and refresh tokens for this user.
      await SessionManager.invalidateAllUserSessions(tokenPayload.userId);
      await RefreshTokenService.revokeAllUserTokens(
        tokenPayload.userId,
        'logout_all'
      );

      // Log logout all event
      await AuditLogger.logSecurityEvent(
        tokenPayload.userId,
        'LOGOUT_ALL_SESSIONS',
        'medium',
        'User logged out from all sessions',
        auditContext
      );

      // Development logging
      if (process.env.NODE_ENV === 'development') {
        console.log('🔒 RBAC Logout All successful:', {
          userId: tokenPayload.userId,
          userType: tokenPayload.currentRole.userType,
        });
      }
    } catch {
      // Token might be invalid/expired
      await AuditLogger.logSecurityEvent(
        'anonymous',
        'LOGOUT_ALL_WITH_INVALID_TOKEN',
        'medium',
        'Logout all attempted with invalid or expired token',
        auditContext
      );

      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      message: 'Logged out from all sessions successfully',
    });

    // Clear RBAC authentication cookies
    for (const name of ['qr_rbac_token', 'qr_refresh_token']) {
      response.cookies.set({
        name,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
    }

    // Clear any legacy authentication cookies
    const legacyCookies = [
      'qr_auth_token',
      'qr_owner_token',
      'qr_staff_token',
      'qr_admin_token',
    ];

    legacyCookies.forEach((cookieName) => {
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
    console.error('RBAC Logout All error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
