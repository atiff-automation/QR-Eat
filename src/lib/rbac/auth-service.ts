/**
 * Enhanced Authentication Service V2 for RBAC
 * 
 * This file implements the new authentication service that integrates with the RBAC system
 * and replaces the problematic multi-cookie authentication approach.
 */

import { NextRequest } from 'next/server';
import { prisma } from '../prisma';
import { AuthService } from '../auth'; // Import existing auth utilities
import { SecurityUtils } from '../security';
import {
  EnhancedJWTPayload,
  EnhancedAuthenticatedUser,
  EnhancedAuthResult,
  UserRole,
  RestaurantContext,
  UserType,
  RoleSwitchRequest,
  RoleSwitchResult,
  RBAC_CONSTANTS,
  RBACError,
  InvalidTokenError,
  SessionExpiredError,
  PermissionDeniedError,
  isValidUserType,
  isValidRoleTemplate
} from './types';
import { EnhancedJWTService } from './jwt';
import { PermissionManager } from './permissions';
import { RoleManager } from './role-manager';
import { SessionManager, CreateSessionParams } from './session-manager';
import { AuditLogger } from './audit-logger';

// Authentication result interface
export interface AuthenticationResult {
  user: EnhancedAuthenticatedUser;
  token: string;
  session: {
    id: string;
    sessionId: string;
    expiresAt: Date;
  };
  currentRole: UserRole;
  availableRoles: UserRole[];
  permissions: string[];
}

// Token validation result interface
export interface TokenValidationResult {
  isValid: boolean;
  payload?: EnhancedJWTPayload;
  user?: EnhancedAuthenticatedUser;
  session?: {
    id: string;
    sessionId: string;
    expiresAt: Date;
  };
  error?: string;
}

// Role switch result interface
export interface RoleSwitchResultV2 {
  success: boolean;
  token?: string;
  currentRole?: UserRole;
  permissions?: string[];
  restaurantContext?: RestaurantContext;
  error?: string;
}

export class AuthServiceV2 {
  /**
   * Authenticate user with email and password
   */
  static async authenticate(
    email: string,
    password: string,
    restaurantSlug?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthenticationResult> {
    try {
      // Validate credentials using existing auth service
      const authenticatedUser = await AuthService.authenticateUser(email, password);
      if (!authenticatedUser) {
        throw new RBACError(
          'Invalid credentials',
          'INVALID_CREDENTIALS',
          401
        );
      }

      // Get user details based on type
      let userId: string;
      let userEmail: string;
      let firstName: string;
      let lastName: string;
      let userType: UserType;
      let mustChangePassword: boolean = false;

      switch (authenticatedUser.type) {
        case UserType.PLATFORM_ADMIN:
          userId = authenticatedUser.user.id;
          userEmail = authenticatedUser.user.email;
          firstName = authenticatedUser.user.firstName;
          lastName = authenticatedUser.user.lastName;
          userType = UserType.PLATFORM_ADMIN;
          mustChangePassword = authenticatedUser.user.mustChangePassword || false;
          break;
        case UserType.RESTAURANT_OWNER:
          userId = authenticatedUser.user.id;
          userEmail = authenticatedUser.user.email;
          firstName = authenticatedUser.user.firstName;
          lastName = authenticatedUser.user.lastName;
          userType = UserType.RESTAURANT_OWNER;
          mustChangePassword = authenticatedUser.user.mustChangePassword || false;
          break;
        case UserType.STAFF:
          userId = authenticatedUser.user.id;
          userEmail = authenticatedUser.user.email;
          firstName = authenticatedUser.user.firstName;
          lastName = authenticatedUser.user.lastName;
          userType = UserType.STAFF;
          mustChangePassword = authenticatedUser.user.mustChangePassword || false;
          break;
        default:
          throw new RBACError(
            'Invalid user type',
            'INVALID_USER_TYPE',
            400
          );
      }

      // Get all available roles for this user
      const availableRoles = await this.getUserAvailableRoles(userId, restaurantSlug);
      
      if (availableRoles.length === 0) {
        throw new RBACError(
          'No active roles found for user',
          'NO_ACTIVE_ROLES',
          403
        );
      }

      // Select default role (highest privilege or restaurant-specific)
      const defaultRole = this.selectDefaultRole(availableRoles, restaurantSlug);

      // Compute permissions for default role
      const permissions = await PermissionManager.computeUserPermissions(userId);

      // Get restaurant context if applicable
      const restaurantContext = defaultRole.restaurantId 
        ? await this.getRestaurantContext(defaultRole.restaurantId)
        : undefined;

      // Create session
      const sessionParams: CreateSessionParams = {
        userId,
        currentRoleId: defaultRole.id,
        restaurantContextId: defaultRole.restaurantId,
        permissions,
        ipAddress,
        userAgent
      };

      const session = await SessionManager.createSession(sessionParams);

      // Create enhanced user object
      const enhancedUser: EnhancedAuthenticatedUser = {
        id: userId,
        email: userEmail,
        firstName,
        lastName,
        userType,
        currentRole: defaultRole,
        availableRoles,
        restaurantContext,
        permissions,
        isActive: true,
        lastLoginAt: new Date(),
        mustChangePassword
      };

      // Generate JWT token
      const token = await EnhancedJWTService.generateToken(
        enhancedUser,
        session.sessionId,
        ipAddress,
        userAgent
      );

      // Update last login time
      await this.updateLastLoginTime(userId, userType);

      // Log successful authentication
      await AuditLogger.logAuthentication(
        userId,
        defaultRole,
        session.sessionId,
        {
          ipAddress,
          userAgent,
          restaurantId: defaultRole.restaurantId,
          metadata: {
            userType,
            loginMethod: 'password'
          }
        }
      );

      return {
        user: enhancedUser,
        token,
        session: {
          id: session.id,
          sessionId: session.sessionId,
          expiresAt: session.expiresAt
        },
        currentRole: defaultRole,
        availableRoles,
        permissions
      };
    } catch (error) {
      // Log failed authentication
      await AuditLogger.logAuthenticationFailure(
        email,
        error instanceof Error ? error.message : 'Unknown error',
        {
          ipAddress,
          userAgent,
          metadata: {
            attemptedRestaurant: restaurantSlug
          }
        }
      );

      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Authentication failed',
        'AUTHENTICATION_FAILED',
        500
      );
    }
  }

  /**
   * Switch user role (for multi-role users)
   */
  static async switchRole(
    sessionId: string,
    newRoleId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<RoleSwitchResultV2> {
    try {
      // Validate session
      const session = await SessionManager.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Invalid session'
        };
      }

      // Validate new role is available to user
      const availableRoles = await this.getUserAvailableRoles(session.userId);
      const newRole = availableRoles.find(role => role.id === newRoleId);

      if (!newRole) {
        return {
          success: false,
          error: 'Role not available for user'
        };
      }

      // Compute new permissions
      const newPermissions = await PermissionManager.computeUserPermissions(session.userId);

      // Get restaurant context for new role
      const restaurantContext = newRole.restaurantId 
        ? await this.getRestaurantContext(newRole.restaurantId)
        : undefined;

      // Update session
      await SessionManager.updateSession(sessionId, {
        currentRoleId: newRoleId,
        restaurantContextId: newRole.restaurantId,
        permissions: newPermissions
      });

      // Get user details for token generation
      const userDetails = await this.getUserDetails(session.userId);
      if (!userDetails) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Create enhanced user object for token generation
      const enhancedUser: EnhancedAuthenticatedUser = {
        id: session.userId,
        email: userDetails.email,
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        userType: userDetails.userType,
        currentRole: newRole,
        availableRoles,
        restaurantContext,
        permissions: newPermissions,
        isActive: true
      };

      // Generate new token
      const newToken = await EnhancedJWTService.generateToken(
        enhancedUser,
        sessionId,
        ipAddress,
        userAgent
      );

      // Log role switch
      await AuditLogger.logRoleSwitch(
        session.userId,
        session.currentRoleId,
        newRoleId,
        sessionId,
        {
          ipAddress,
          userAgent,
          restaurantId: newRole.restaurantId,
          metadata: {
            fromTemplate: session.currentRoleId,
            toTemplate: newRole.roleTemplate
          }
        }
      );

      return {
        success: true,
        token: newToken,
        currentRole: newRole,
        permissions: newPermissions,
        restaurantContext
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Role switch failed'
      };
    }
  }

  /**
   * Validate JWT token
   */
  static async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 AuthServiceV2.validateToken: Starting validation for token:', token.substring(0, 20) + '...');
      }
      
      // Verify JWT token
      const payload = await EnhancedJWTService.verifyToken(token);

      // Get session to ensure it's still valid
      const session = await SessionManager.getSession(payload.sessionId);
      if (!session) {
        return {
          isValid: false,
          error: 'Session not found or expired'
        };
      }

      // Reconstruct user from payload
      const user = await EnhancedJWTService.reconstructUserFromPayload(payload);
      if (!user) {
        return {
          isValid: false,
          error: 'User not found or inactive'
        };
      }

      // Update last activity
      await SessionManager.updateLastActivity(payload.sessionId);

      return {
        isValid: true,
        payload,
        user,
        session: {
          id: session.id,
          sessionId: session.sessionId,
          expiresAt: session.expiresAt
        }
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🚫 AuthServiceV2.validateToken: Caught error:', {
          errorType: error.constructor.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 5)
        });
      }
      
      if (error instanceof SessionExpiredError) {
        return {
          isValid: false,
          error: 'Session expired'
        };
      }
      if (error instanceof InvalidTokenError) {
        return {
          isValid: false,
          error: 'Invalid token'
        };
      }
      return {
        isValid: false,
        error: 'Token validation failed'
      };
    }
  }

  /**
   * Refresh JWT token
   */
  static async refreshToken(
    currentToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    try {
      return await EnhancedJWTService.refreshToken(currentToken, ipAddress, userAgent);
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Token refresh failed',
        'TOKEN_REFRESH_FAILED',
        401
      );
    }
  }

  /**
   * Logout user
   */
  static async logout(sessionId: string, context?: { ipAddress?: string; userAgent?: string }): Promise<void> {
    try {
      // Get session info for logging
      const session = await SessionManager.getSession(sessionId);

      // Invalidate session
      await SessionManager.invalidateSession(sessionId);

      // Log logout
      if (session) {
        await AuditLogger.logLogout(
          session.userId,
          sessionId,
          {
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
            metadata: {
              sessionDuration: Date.now() - session.lastActivity.getTime()
            }
          }
        );
      }
    } catch (error) {
      // Silent fail for logout - not critical
    }
  }

  /**
   * Logout all sessions for a user
   */
  static async logoutAll(userId: string): Promise<void> {
    try {
      await SessionManager.invalidateAllUserSessions(userId);
    } catch (error) {
      throw new RBACError(
        'Failed to logout all sessions',
        'LOGOUT_ALL_FAILED',
        500
      );
    }
  }

  /**
   * Get available roles for user
   */
  static async getUserAvailableRoles(
    userId: string,
    restaurantSlug?: string
  ): Promise<UserRole[]> {
    try {
      let availableRoles = await RoleManager.getUserRoles(userId);

      // Filter by restaurant if slug provided
      if (restaurantSlug) {
        const restaurant = await prisma.restaurant.findUnique({
          where: { slug: restaurantSlug },
          select: { id: true, isActive: true }
        });

        if (restaurant && restaurant.isActive) {
          availableRoles = availableRoles.filter(role => 
            role.restaurantId === restaurant.id || !role.restaurantId
          );
        }
      }

      return availableRoles;
    } catch (error) {
      throw new RBACError(
        'Failed to get user roles',
        'GET_USER_ROLES_FAILED',
        500
      );
    }
  }

  /**
   * Select default role for user
   */
  static selectDefaultRole(
    availableRoles: UserRole[],
    restaurantSlug?: string
  ): UserRole {
    // Priority order: platform_admin > restaurant_owner > manager > kitchen_staff
    const rolePriority = {
      'platform_admin': 4,
      'restaurant_owner': 3,
      'manager': 2,
      'kitchen_staff': 1
    };

    // If restaurant slug provided, prefer roles for that restaurant
    if (restaurantSlug) {
      const restaurantRoles = availableRoles.filter(role => role.restaurantId);
      if (restaurantRoles.length > 0) {
        return restaurantRoles.sort((a, b) => 
          (rolePriority[b.roleTemplate as keyof typeof rolePriority] || 0) - 
          (rolePriority[a.roleTemplate as keyof typeof rolePriority] || 0)
        )[0];
      }
    }

    // Otherwise, select highest priority role
    return availableRoles.sort((a, b) => 
      (rolePriority[b.roleTemplate as keyof typeof rolePriority] || 0) - 
      (rolePriority[a.roleTemplate as keyof typeof rolePriority] || 0)
    )[0];
  }

  /**
   * Get restaurant context
   */
  static async getRestaurantContext(restaurantId: string): Promise<RestaurantContext> {
    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          timezone: true,
          currency: true
        }
      });

      if (!restaurant) {
        throw new RBACError(
          'Restaurant not found',
          'RESTAURANT_NOT_FOUND',
          404
        );
      }

      return {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        isActive: restaurant.isActive,
        timezone: restaurant.timezone,
        currency: restaurant.currency
      };
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to get restaurant context',
        'GET_RESTAURANT_CONTEXT_FAILED',
        500
      );
    }
  }

  /**
   * Get user details by ID and user type
   */
  static async getUserDetails(userId: string): Promise<{
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
  } | null> {
    try {
      // Try platform admin first
      const platformAdmin = await prisma.platformAdmin.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (platformAdmin) {
        return {
          email: platformAdmin.email,
          firstName: platformAdmin.firstName,
          lastName: platformAdmin.lastName,
          userType: UserType.PLATFORM_ADMIN
        };
      }

      // Try restaurant owner
      const restaurantOwner = await prisma.restaurantOwner.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (restaurantOwner) {
        return {
          email: restaurantOwner.email,
          firstName: restaurantOwner.firstName,
          lastName: restaurantOwner.lastName,
          userType: UserType.RESTAURANT_OWNER
        };
      }

      // Try staff
      const staff = await prisma.staff.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (staff) {
        return {
          email: staff.email,
          firstName: staff.firstName,
          lastName: staff.lastName,
          userType: UserType.STAFF
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update last login time for user
   */
  static async updateLastLoginTime(userId: string, userType: UserType): Promise<void> {
    try {
      const now = new Date();

      switch (userType) {
        case UserType.PLATFORM_ADMIN:
          await prisma.platformAdmin.update({
            where: { id: userId },
            data: { lastLoginAt: now }
          });
          break;
        case UserType.RESTAURANT_OWNER:
          await prisma.restaurantOwner.update({
            where: { id: userId },
            data: { lastLoginAt: now }
          });
          break;
        case UserType.STAFF:
          await prisma.staff.update({
            where: { id: userId },
            data: { lastLoginAt: now }
          });
          break;
      }
    } catch (error) {
      // Silent fail - not critical
    }
  }

  /**
   * Extract client IP from request
   */
  static getClientIP(request?: NextRequest): string | undefined {
    if (!request) return undefined;
    return SecurityUtils.getClientIP(request);
  }

  /**
   * Extract user agent from request
   */
  static getUserAgent(request?: NextRequest): string | undefined {
    if (!request) return undefined;
    return request.headers.get('user-agent') || undefined;
  }

  /**
   * Check if user has permission
   */
  static async checkPermission(
    userId: string,
    permission: string
  ): Promise<boolean> {
    try {
      const permissions = await PermissionManager.computeUserPermissions(userId);
      return PermissionManager.hasPermission(permissions, permission);
    } catch (error) {
      return false;
    }
  }

  /**
   * Assert user has permission (throws error if not)
   */
  static async assertPermission(
    userId: string,
    permission: string
  ): Promise<void> {
    const hasPermission = await this.checkPermission(userId, permission);
    if (!hasPermission) {
      throw new PermissionDeniedError(permission);
    }
  }

  /**
   * Get authentication statistics
   */
  static async getAuthStatistics(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalSessions: number;
    activeSessions: number;
    usersByType: Record<string, number>;
  }> {
    try {
      const sessionStats = await SessionManager.getSessionStatistics();
      
      // Count users by type
      const platformAdmins = await prisma.platformAdmin.count({
        where: { isActive: true }
      });
      const restaurantOwners = await prisma.restaurantOwner.count({
        where: { isActive: true }
      });
      const staff = await prisma.staff.count({
        where: { isActive: true }
      });

      const totalUsers = platformAdmins + restaurantOwners + staff;

      // Count active users (users with active sessions)
      const activeUserIds = new Set(
        (await SessionManager.getUserSessions('')).map(s => s.userId)
      );

      return {
        totalUsers,
        activeUsers: activeUserIds.size,
        totalSessions: sessionStats.totalActiveSessions + sessionStats.expiredSessionsCount,
        activeSessions: sessionStats.totalActiveSessions,
        usersByType: {
          platform_admin: platformAdmins,
          restaurant_owner: restaurantOwners,
          staff: staff
        }
      };
    } catch (error) {
      throw new RBACError(
        'Failed to get auth statistics',
        'GET_AUTH_STATISTICS_FAILED',
        500
      );
    }
  }
}