/**
 * RBAC Middleware for API Protection
 * 
 * This middleware provides comprehensive RBAC protection for API endpoints,
 * replacing the legacy authentication system with secure, role-based access control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { EnhancedJWTService } from '@/lib/rbac/jwt';
import { PermissionManager } from '@/lib/rbac/permissions';
import { SessionManager } from '@/lib/rbac/session-manager';
import { LegacyTokenSupport } from '@/lib/rbac/legacy-token-support';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';
import { RoleManager } from '@/lib/rbac/role-manager';
import { EnhancedJWTPayload, UserRole } from '@/lib/rbac/types';

// Middleware configuration
export interface RBACMiddlewareConfig {
  requiredPermissions?: string[];
  allowedRoles?: string[];
  allowedUserTypes?: string[];
  requireActiveSession?: boolean;
  allowLegacyTokens?: boolean;
  auditLog?: boolean;
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}

// Request context after RBAC validation
export interface RBACContext {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
    isActive: boolean;
  };
  currentRole: UserRole;
  availableRoles: UserRole[];
  permissions: string[];
  restaurantContext?: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    timezone: string;
    currency: string;
  };
  session: {
    id: string;
    expiresAt: Date;
    lastActivity: Date;
    ipAddress?: string;
  };
  tokenInfo: {
    issuedAt: Date;
    expiresAt: Date;
    issuer: string;
  };
}

// Rate limiting storage
const rateLimitMap = new Map<string, { requests: number; resetTime: number }>();

export class RBACMiddleware {
  /**
   * Main RBAC middleware function
   */
  static async protect(
    request: NextRequest,
    config: RBACMiddlewareConfig = {}
  ): Promise<{
    isAuthorized: boolean;
    response?: NextResponse;
    context?: RBACContext;
    error?: string;
  }> {
    try {
      // Get client information
      const clientIP = SecurityUtils.getClientIP(request);
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const auditContext = {
        ipAddress: clientIP,
        userAgent,
        metadata: {
          endpoint: request.url,
          method: request.method,
          timestamp: new Date().toISOString()
        }
      };

      // Rate limiting if configured
      if (config.rateLimit) {
        const rateLimitResult = this.checkRateLimit(clientIP, config.rateLimit);
        if (!rateLimitResult.allowed) {
          if (config.auditLog) {
            await AuditLogger.logSecurityEvent(
              'anonymous',
              'RATE_LIMIT_EXCEEDED',
              'medium',
              `Rate limit exceeded for ${request.url}`,
              auditContext
            );
          }
          
          return {
            isAuthorized: false,
            response: NextResponse.json(
              { error: 'Rate limit exceeded' },
              { status: 429 }
            ),
            error: 'Rate limit exceeded'
          };
        }
      }

      // Extract authentication token
      let token = request.cookies.get('qr_rbac_token')?.value;
      
      if (!token) {
        const authHeader = request.headers.get('authorization');
        token = EnhancedJWTService.extractTokenFromHeader(authHeader);
      }

      if (!token) {
        if (config.auditLog) {
          await AuditLogger.logSecurityEvent(
            'anonymous',
            'NO_TOKEN_PROVIDED',
            'low',
            `No authentication token provided for ${request.url}`,
            auditContext
          );
        }
        
        return {
          isAuthorized: false,
          response: NextResponse.json(
            { error: 'Authentication token required' },
            { status: 401 }
          ),
          error: 'No authentication token provided'
        };
      }

      // Verify token and get user context
      let tokenPayload: EnhancedJWTPayload;
      let isLegacyToken = false;

      try {
        // Try RBAC token first
        tokenPayload = await EnhancedJWTService.verifyToken(token);
      } catch (error) {
        // If RBAC token fails and legacy tokens are allowed, try legacy token
        if (config.allowLegacyTokens) {
          const legacyValidation = await LegacyTokenSupport.validateLegacyToken(token, request);
          
          if (legacyValidation.isValid && legacyValidation.shouldUpgrade) {
            const upgradeResult = await LegacyTokenSupport.upgradeLegacyToken(token, request);
            
            if (upgradeResult.success && upgradeResult.newToken) {
              // Use upgraded token
              tokenPayload = await EnhancedJWTService.verifyToken(upgradeResult.newToken);
              isLegacyToken = true;
            } else {
              if (config.auditLog) {
                await AuditLogger.logSecurityEvent(
                  'anonymous',
                  'LEGACY_TOKEN_UPGRADE_FAILED',
                  'medium',
                  `Legacy token upgrade failed for ${request.url}`,
                  auditContext
                );
              }
              
              return {
                isAuthorized: false,
                response: NextResponse.json(
                  { error: 'Token upgrade failed' },
                  { status: 401 }
                ),
                error: 'Legacy token upgrade failed'
              };
            }
          } else {
            if (config.auditLog) {
              await AuditLogger.logSecurityEvent(
                'anonymous',
                'INVALID_TOKEN',
                'medium',
                `Invalid token provided for ${request.url}`,
                auditContext
              );
            }
            
            return {
              isAuthorized: false,
              response: NextResponse.json(
                { error: 'Invalid authentication token' },
                { status: 401 }
              ),
              error: 'Invalid authentication token'
            };
          }
        } else {
          if (config.auditLog) {
            await AuditLogger.logSecurityEvent(
              'anonymous',
              'INVALID_TOKEN',
              'medium',
              `Invalid token provided for ${request.url}`,
              auditContext
            );
          }
          
          return {
            isAuthorized: false,
            response: NextResponse.json(
              { error: 'Invalid authentication token' },
              { status: 401 }
            ),
            error: 'Invalid authentication token'
          };
        }
      }

      // Verify session if required
      if (config.requireActiveSession !== false) {
        const session = await SessionManager.getSession(tokenPayload.sessionId);
        
        if (!session) {
          if (config.auditLog) {
            await AuditLogger.logSecurityEvent(
              tokenPayload.userId,
              'SESSION_NOT_FOUND',
              'medium',
              `Session not found for ${request.url}`,
              auditContext
            );
          }
          
          return {
            isAuthorized: false,
            response: NextResponse.json(
              { error: 'Session not found or expired' },
              { status: 401 }
            ),
            error: 'Session not found or expired'
          };
        }
      }

      // Check user type restrictions
      if (config.allowedUserTypes && config.allowedUserTypes.length > 0) {
        if (!config.allowedUserTypes.includes(tokenPayload.currentRole.userType)) {
          if (config.auditLog) {
            await AuditLogger.logPermissionDenied(
              tokenPayload.userId,
              request.url,
              'user_type_restriction',
              tokenPayload.sessionId,
              auditContext
            );
          }
          
          return {
            isAuthorized: false,
            response: NextResponse.json(
              { error: 'Access denied - user type not allowed' },
              { status: 403 }
            ),
            error: 'User type not allowed'
          };
        }
      }

      // Check role restrictions
      if (config.allowedRoles && config.allowedRoles.length > 0) {
        if (!config.allowedRoles.includes(tokenPayload.currentRole.roleTemplate)) {
          if (config.auditLog) {
            await AuditLogger.logPermissionDenied(
              tokenPayload.userId,
              request.url,
              'role_restriction',
              tokenPayload.sessionId,
              auditContext
            );
          }
          
          return {
            isAuthorized: false,
            response: NextResponse.json(
              { error: 'Access denied - role not allowed' },
              { status: 403 }
            ),
            error: 'Role not allowed'
          };
        }
      }

      // Check permission restrictions
      if (config.requiredPermissions && config.requiredPermissions.length > 0) {
        const userPermissions = await PermissionManager.computeUserPermissions(tokenPayload.userId);
        const hasPermission = PermissionManager.hasAllPermissions(
          userPermissions,
          config.requiredPermissions
        );
        
        if (!hasPermission) {
          if (config.auditLog) {
            await AuditLogger.logPermissionDenied(
              tokenPayload.userId,
              request.url,
              config.requiredPermissions.join(', '),
              tokenPayload.sessionId,
              auditContext
            );
          }
          
          return {
            isAuthorized: false,
            response: NextResponse.json(
              { error: 'Access denied - insufficient permissions' },
              { status: 403 }
            ),
            error: 'Insufficient permissions'
          };
        }
      }

      // Get fresh user roles and permissions
      const userRoles = await RoleManager.getUserRoles(tokenPayload.userId);
      const permissions = await PermissionManager.computeUserPermissions(tokenPayload.userId);

      // Build context
      const context: RBACContext = {
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
          id: tokenPayload.sessionId,
          expiresAt: new Date(tokenPayload.exp * 1000),
          lastActivity: new Date(),
          ipAddress: clientIP
        },
        tokenInfo: {
          issuedAt: new Date(tokenPayload.iat * 1000),
          expiresAt: new Date(tokenPayload.exp * 1000),
          issuer: tokenPayload.iss
        }
      };

      // Log successful authorization if configured
      if (config.auditLog) {
        await AuditLogger.logSecurityEvent(
          tokenPayload.userId,
          'ENDPOINT_ACCESS',
          'low',
          `Authorized access to ${request.url}`,
          auditContext
        );
      }

      // Create response if legacy token was upgraded
      let response: NextResponse | undefined;
      if (isLegacyToken) {
        response = NextResponse.next();
        response.cookies.set({
          name: 'qr_rbac_token',
          value: await EnhancedJWTService.refreshToken(token, clientIP, userAgent),
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60,
          path: '/',
        });
      }

      return {
        isAuthorized: true,
        context,
        response
      };
    } catch (error) {
      console.error('RBAC Middleware error:', error);
      
      // Log system error
      const clientIP = SecurityUtils.getClientIP(request);
      const userAgent = request.headers.get('user-agent') || 'unknown';
      
      if (config.auditLog) {
        await AuditLogger.logSecurityEvent(
          'system',
          'MIDDLEWARE_ERROR',
          'high',
          `RBAC middleware error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            ipAddress: clientIP,
            userAgent,
            metadata: {
              endpoint: request.url,
              method: request.method,
              errorType: error instanceof Error ? error.constructor.name : 'Unknown',
              timestamp: new Date().toISOString()
            }
          }
        );
      }

      return {
        isAuthorized: false,
        response: NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        ),
        error: 'Internal server error'
      };
    }
  }

  /**
   * Rate limiting check
   */
  private static checkRateLimit(
    clientIP: string,
    config: { windowMs: number; maxRequests: number }
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const key = `rate_limit:${clientIP}`;
    const rateLimit = rateLimitMap.get(key);

    if (!rateLimit || now >= rateLimit.resetTime) {
      // Reset or create new rate limit window
      rateLimitMap.set(key, {
        requests: 1,
        resetTime: now + config.windowMs
      });
      
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs
      };
    }

    if (rateLimit.requests >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: rateLimit.resetTime
      };
    }

    // Increment request count
    rateLimit.requests++;
    rateLimitMap.set(key, rateLimit);

    return {
      allowed: true,
      remaining: config.maxRequests - rateLimit.requests,
      resetTime: rateLimit.resetTime
    };
  }

  /**
   * Cleanup expired rate limits
   */
  static cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, rateLimit] of rateLimitMap.entries()) {
      if (now >= rateLimit.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }
}

// Helper function to create middleware with specific config
export function createRBACMiddleware(config: RBACMiddlewareConfig = {}) {
  return async (request: NextRequest) => {
    return RBACMiddleware.protect(request, config);
  };
}

// Predefined middleware configurations
export const rbacMiddlewareConfigs = {
  // Platform admin only
  platformAdmin: {
    allowedUserTypes: ['platform_admin'],
    requireActiveSession: true,
    auditLog: true,
    rateLimit: { windowMs: 60000, maxRequests: 100 }
  },
  
  // Restaurant owner only
  restaurantOwner: {
    allowedUserTypes: ['restaurant_owner'],
    requireActiveSession: true,
    auditLog: true,
    rateLimit: { windowMs: 60000, maxRequests: 200 }
  },
  
  // Manager and above
  managerAndAbove: {
    allowedRoles: ['platform_admin', 'restaurant_owner', 'manager'],
    requireActiveSession: true,
    auditLog: true,
    rateLimit: { windowMs: 60000, maxRequests: 150 }
  },
  
  // Staff access
  staffAccess: {
    allowedUserTypes: ['staff'],
    requireActiveSession: true,
    auditLog: false,
    rateLimit: { windowMs: 60000, maxRequests: 300 }
  },
  
  // Any authenticated user
  authenticated: {
    requireActiveSession: true,
    auditLog: false,
    allowLegacyTokens: true,
    rateLimit: { windowMs: 60000, maxRequests: 500 }
  }
} as const;

