/**
 * RBAC-Integrated User Info Endpoint
 * 
 * This endpoint provides current user information using the new RBAC system,
 * including roles, permissions, and session details.
 */

import { NextRequest, NextResponse } from 'next/server';
import { EnhancedJWTService } from '@/lib/rbac/jwt';
import { SessionManager } from '@/lib/rbac/session-manager';
import { RoleManager } from '@/lib/rbac/role-manager';
import { PermissionManager } from '@/lib/rbac/permissions';
import { LegacyTokenSupport } from '@/lib/rbac/legacy-token-support';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    // Get token from cookie or Authorization header
    let token = request.cookies.get('qr_rbac_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      token = EnhancedJWTService.extractTokenFromHeader(authHeader);
    }

    if (!token) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 }
      );
    }

    // Get client information for audit
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    try {
      // First try to verify as RBAC token
      const tokenPayload = await EnhancedJWTService.verifyToken(token);
      
      // Get current session information
      const session = await SessionManager.getSession(tokenPayload.sessionId);
      
      if (!session) {
        return NextResponse.json(
          { error: 'Session not found or expired' },
          { status: 401 }
        );
      }

      // Get fresh user roles (in case they changed)
      const userRoles = await RoleManager.getUserRoles(tokenPayload.userId);
      const permissions = await PermissionManager.getUserPermissions(tokenPayload.userId);

      // Prepare response data
      const responseData = {
        user: {
          id: tokenPayload.userId,
          email: tokenPayload.email,
          firstName: tokenPayload.firstName,
          lastName: tokenPayload.lastName,
          userType: tokenPayload.currentRole.userType,
          isActive: true
        },
        currentRole: tokenPayload.currentRole,
        availableRoles: userRoles,
        permissions,
        restaurantContext: tokenPayload.restaurantContext,
        session: {
          id: session.sessionId,
          expiresAt: session.expiresAt,
          lastActivity: session.lastActivity,
          ipAddress: session.ipAddress
        },
        tokenInfo: {
          issuedAt: new Date(tokenPayload.iat * 1000),
          expiresAt: new Date(tokenPayload.exp * 1000),
          issuer: tokenPayload.iss
        }
      };

      return NextResponse.json(responseData);
    } catch (error) {
      // Token verification failed - check if it's a legacy token
      const legacyValidation = await LegacyTokenSupport.validateLegacyToken(token, request);
      
      if (legacyValidation.isValid && legacyValidation.shouldUpgrade) {
        // Attempt to upgrade the legacy token
        const upgradeResult = await LegacyTokenSupport.upgradeLegacyToken(token, request);
        
        if (upgradeResult.success && upgradeResult.newToken && upgradeResult.userRole) {
          // Return response with upgrade notification
          const response = NextResponse.json({
            message: 'Legacy token detected and upgraded',
            requiresTokenUpdate: true,
            newToken: upgradeResult.newToken,
            user: {
              id: legacyValidation.payload!.userId,
              userType: upgradeResult.userRole.userType,
              currentRole: upgradeResult.userRole
            }
          });

          // Set new RBAC cookie
          response.cookies.set({
            name: 'qr_rbac_token',
            value: upgradeResult.newToken,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60, // 24 hours
            path: '/',
          });

          return response;
        }
      }

      // Log authentication failure
      await AuditLogger.logSecurityEvent(
        'anonymous',
        'INVALID_TOKEN_ACCESS',
        'medium',
        'Invalid token used to access user info endpoint',
        {
          ipAddress: clientIP,
          userAgent,
          metadata: {
            endpoint: 'rbac-me',
            tokenPresent: !!token,
            tokenLength: token?.length || 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      );

      return NextResponse.json(
        { error: 'Invalid or expired authentication token' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('RBAC Me endpoint error:', error);
    
    // Log system error
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    await AuditLogger.logSecurityEvent(
      'system',
      'ME_ENDPOINT_ERROR',
      'high',
      `Me endpoint error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: clientIP,
        userAgent,
        metadata: {
          endpoint: 'rbac-me',
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          timestamp: new Date().toISOString()
        }
      }
    );

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Refresh token endpoint
export async function POST(request: NextRequest) {
  try {
    // Get current token from cookie
    const currentToken = request.cookies.get('qr_rbac_token')?.value;

    if (!currentToken) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 }
      );
    }

    // Get client information
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    try {
      // Refresh the token
      const newToken = await EnhancedJWTService.refreshToken(
        currentToken,
        clientIP,
        userAgent
      );

      // Verify the new token to get user info
      const tokenPayload = await EnhancedJWTService.verifyToken(newToken);

      // Log token refresh
      await AuditLogger.logTokenRefresh(
        tokenPayload.userId,
        tokenPayload.sessionId,
        {
          ipAddress: clientIP,
          userAgent,
          metadata: {
            endpoint: 'rbac-me-refresh',
            refreshTime: new Date().toISOString()
          }
        }
      );

      const response = NextResponse.json({
        message: 'Token refreshed successfully',
        user: {
          id: tokenPayload.userId,
          email: tokenPayload.email,
          firstName: tokenPayload.firstName,
          lastName: tokenPayload.lastName,
          userType: tokenPayload.currentRole.userType
        },
        session: {
          id: tokenPayload.sessionId,
          expiresAt: new Date(tokenPayload.exp * 1000)
        }
      });

      // Update authentication cookie with new token
      response.cookies.set({
        name: 'qr_rbac_token',
        value: newToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });

      // Development logging
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Token refresh successful:', {
          userId: tokenPayload.userId,
          sessionId: tokenPayload.sessionId,
          userType: tokenPayload.currentRole.userType
        });
      }

      return response;
    } catch (error) {
      // Log refresh failure
      await AuditLogger.logSecurityEvent(
        'anonymous',
        'TOKEN_REFRESH_FAILED',
        'medium',
        `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          ipAddress: clientIP,
          userAgent,
          metadata: {
            endpoint: 'rbac-me-refresh',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      );

      return NextResponse.json(
        { error: 'Token refresh failed' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}