/**
 * RBAC-Enhanced User Info Endpoint
 * 
 * This endpoint provides current user information using the new RBAC system,
 * including roles, permissions, and session details.
 * 
 * Implements Phase 5.2.1 of RBAC Implementation Plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Get authentication token - Use RBAC token primarily, with legacy fallback
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value || // Fallback for transition period
                  request.cookies.get('qr_owner_token')?.value ||
                  request.cookies.get('qr_staff_token')?.value ||
                  request.cookies.get('qr_admin_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get client information for audit
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    try {
      // Validate token using RBAC system
      const validation = await AuthServiceV2.validateToken(token);
      
      if (!validation.isValid || !validation.payload || !validation.user || !validation.session) {
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
              endpoint: 'me',
              tokenPresent: !!token,
              tokenLength: token?.length || 0
            }
          }
        );

        return NextResponse.json(
          { error: 'Invalid or expired authentication token' },
          { status: 401 }
        );
      }

      const { payload, user, session } = validation;

      // Prepare response data according to RBAC plan specification
      const responseData = {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          mustChangePassword: user.mustChangePassword
        },
        currentRole: user.currentRole,
        availableRoles: user.availableRoles,
        permissions: user.permissions,
        restaurantContext: user.restaurantContext,
        session: {
          id: session.sessionId,
          expiresAt: session.expiresAt,
          lastActivity: payload.iat ? new Date(payload.iat * 1000) : undefined
        },
        tokenInfo: {
          issuedAt: payload.iat ? new Date(payload.iat * 1000) : undefined,
          expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
          issuer: payload.iss
        }
      };

      // Development logging
      if (process.env.NODE_ENV === 'development') {
        console.log('📝 RBAC Me endpoint successful:', {
          userId: user.id,
          userType: user.userType,
          roleTemplate: user.currentRole.roleTemplate,
          permissions: user.permissions.length,
          sessionId: session.sessionId,
          mustChangePassword: user.mustChangePassword
        });
      }

      return NextResponse.json(responseData);
    } catch (error) {
      // Log system error
      await AuditLogger.logSecurityEvent(
        'system',
        'ME_ENDPOINT_ERROR',
        'high',
        `Me endpoint error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          ipAddress: clientIP,
          userAgent,
          metadata: {
            endpoint: 'me',
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
  } catch (error) {
    console.error('RBAC Me endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
