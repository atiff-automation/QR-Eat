/**
 * Role Switching Endpoint for RBAC System
 * 
 * This endpoint allows users to switch between their available roles
 * within a single session, implementing seamless role transitions.
 * 
 * Implements Phase 5.2.1 of RBAC Implementation Plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    const { newRoleId } = await request.json();
    
    if (!newRoleId) {
      return NextResponse.json(
        { error: 'Role ID is required' },
        { status: 400 }
      );
    }

    // Extract session from current token
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value; // Fallback for transition
                  
    if (!token) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 }
      );
    }
    
    // Validate current token
    const validation = await AuthServiceV2.validateToken(token);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }
    
    // Get client information for audit logging
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Switch role using RBAC system
    const switchResult = await AuthServiceV2.switchRole(
      validation.payload.sessionId,
      newRoleId,
      clientIP,
      userAgent
    );

    if (!switchResult.success) {
      return NextResponse.json(
        { error: switchResult.error || 'Role switch failed' },
        { status: 400 }
      );
    }

    const { token: newToken, user, session } = switchResult;

    // Prepare response data
    const responseData = {
      message: 'Role switched successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        currentRole: user.currentRole,
        availableRoles: user.availableRoles,
        permissions: user.permissions
      },
      session: {
        id: session.sessionId,
        expiresAt: session.expiresAt
      }
    };

    // Add restaurant context if available
    if (user.restaurantContext) {
      responseData.restaurant = user.restaurantContext;
    }

    const response = NextResponse.json(responseData);

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
      console.log('🔄 Role switch successful:', {
        userId: user.id,
        fromRole: validation.payload.currentRole.roleTemplate,
        toRole: user.currentRole.roleTemplate,
        sessionId: session.sessionId,
        permissions: user.permissions.length
      });
    }

    return response;
  } catch (error) {
    console.error('Role switch error:', error);
    
    // Log security event for system errors
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    await AuditLogger.logSecurityEvent(
      'system',
      'ROLE_SWITCH_ERROR',
      'medium',
      `Role switch system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: clientIP,
        userAgent,
        metadata: {
          endpoint: 'switch-role',
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