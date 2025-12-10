/**
 * RBAC-Integrated Authentication Endpoint
 * 
 * This endpoint provides authentication using the new RBAC system,
 * replacing the problematic multi-cookie authentication approach.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { resolveTenant } from '@/lib/tenant-resolver';
import { SecurityUtils } from '@/lib/security';
import { getRestaurantSlugFromSubdomain } from '@/lib/subdomain';

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const rateLimitMap = new Map<string, { attempts: number; resetTime: number }>();

export async function POST(request: NextRequest) {
  try {
    const { email, password, restaurantSlug } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Get client information for security
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const auditContext = {
      ipAddress: clientIP,
      userAgent,
      metadata: {
        endpoint: 'rbac-login',
        requestTime: new Date().toISOString()
      }
    };

    // Rate limiting by IP
    const now = Date.now();
    const clientKey = `${clientIP}:${email}`;
    const rateLimit = rateLimitMap.get(clientKey);
    
    if (rateLimit) {
      if (now < rateLimit.resetTime) {
        if (rateLimit.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
          await AuditLogger.logSecurityEvent(
            'anonymous',
            'RATE_LIMIT_EXCEEDED',
            'medium',
            `Rate limit exceeded for ${email}`,
            auditContext
          );
          
          return NextResponse.json(
            { error: 'Too many login attempts. Please try again later.' },
            { status: 429 }
          );
        }
      } else {
        // Reset the rate limit window
        rateLimitMap.set(clientKey, { attempts: 1, resetTime: now + RATE_LIMIT_WINDOW });
      }
    } else {
      rateLimitMap.set(clientKey, { attempts: 1, resetTime: now + RATE_LIMIT_WINDOW });
    }

    // Check if this is a subdomain request
    const currentSlug = getRestaurantSlugFromSubdomain(request) || restaurantSlug;
    
    // If subdomain access, validate the restaurant exists
    let tenantContext = null;
    if (currentSlug) {
      const tenantResult = await resolveTenant(currentSlug);
      if (!tenantResult.isValid || !tenantResult.tenant) {
        return NextResponse.json(
          { error: 'Restaurant not found or unavailable' },
          { status: 404 }
        );
      }
      tenantContext = tenantResult.tenant;
    }

    // Authenticate user using RBAC system
    let authResult;
    try {
      authResult = await AuthServiceV2.authenticate(
        email,
        password,
        currentSlug,
        clientIP,
        userAgent
      );
    } catch (error) {
      // Increment rate limit attempts
      const currentRateLimit = rateLimitMap.get(clientKey);
      if (currentRateLimit) {
        rateLimitMap.set(clientKey, {
          attempts: currentRateLimit.attempts + 1,
          resetTime: currentRateLimit.resetTime
        });
      }

      // Log authentication failure
      await AuditLogger.logAuthenticationFailure(
        email,
        error instanceof Error ? error.message : 'Invalid credentials',
        auditContext
      );

      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Success - clear rate limit and extract result
    rateLimitMap.delete(clientKey);
    const { token, user, session } = authResult;

    // Add tenant context if subdomain access
    const responseData: Record<string, unknown> = {
      message: 'Login successful',
      userType: user.userType,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        currentRole: user.currentRole,
        availableRoles: user.availableRoles,
        permissions: user.permissions,
        mustChangePassword: user.mustChangePassword
      },
      session: {
        id: session.sessionId,
        expiresAt: session.expiresAt
      }
    };

    // Add tenant context if subdomain access
    if (tenantContext) {
      responseData.tenant = {
        id: tenantContext.id,
        name: tenantContext.name,
        slug: tenantContext.slug,
        isActive: tenantContext.isActive
      };
    }

    // Add restaurant context if available
    if (user.restaurantContext) {
      responseData.restaurant = user.restaurantContext;
    }

    const response = NextResponse.json(responseData);

    // Set single RBAC authentication cookie
    response.cookies.set({
      name: 'qr_rbac_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
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
      if (request.cookies.get(cookieName)) {
        response.cookies.set({
          name: cookieName,
          value: '',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 0,
          path: '/',
        });
      }
    });

    // Development logging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔑 RBAC Login successful:', {
        userId: user.id,
        userType: user.userType,
        email: user.email,
        roleTemplate: user.currentRole.roleTemplate,
        sessionId: session.sessionId,
        permissions: user.permissions.length,
        restaurantContext: user.restaurantContext?.name || 'None'
      });
    }

    return response;
  } catch (error) {
    console.error('RBAC Login error:', error);
    
    // Log security event for system errors
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    await AuditLogger.logSecurityEvent(
      'system',
      'AUTHENTICATION_ERROR',
      'high',
      `Authentication system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: clientIP,
        userAgent,
        metadata: {
          endpoint: 'rbac-login',
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

// Role switching endpoint
export async function PATCH(request: NextRequest) {
  try {
    const { roleId } = await request.json();

    if (!roleId) {
      return NextResponse.json(
        { error: 'Role ID is required' },
        { status: 400 }
      );
    }

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

    // Switch role using RBAC system
    const switchResult = await AuthServiceV2.switchRole(
      currentToken,
      roleId,
      clientIP,
      userAgent
    );

    if (!switchResult.success) {
      return NextResponse.json(
        { error: switchResult.error || 'Role switch failed' },
        { status: 400 }
      );
    }

    const { token, user, session } = switchResult;

    const responseData = {
      message: 'Role switched successfully',
      userType: user.userType,
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
      value: token,
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
        newRole: user.currentRole.roleTemplate,
        sessionId: session.sessionId,
        permissions: user.permissions.length
      });
    }

    return response;
  } catch (error) {
    console.error('Role switch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}