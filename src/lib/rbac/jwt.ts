/**
 * Enhanced JWT System for RBAC
 *
 * This file implements the new JWT system that replaces the problematic
 * multi-cookie authentication system with a single, secure JWT token.
 */

import * as jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { prisma } from '@/lib/database';
import {
  EnhancedJWTPayload,
  EnhancedAuthenticatedUser,
  UserSession,
  JWTConfig,
  ValidationResult,
  RBAC_CONSTANTS,
  InvalidTokenError,
  SessionExpiredError,
  RBACError,
  isEnhancedJWTPayload,
} from './types';

// JWT Configuration
const JWT_CONFIG: JWTConfig = {
  secret: process.env.JWT_SECRET || 'fallback-secret-for-development',
  expiresIn: process.env.JWT_EXPIRES_IN || RBAC_CONSTANTS.JWT_EXPIRES_IN,
  issuer: RBAC_CONSTANTS.JWT_ISSUER,
  algorithm: RBAC_CONSTANTS.JWT_ALGORITHM,
};

// Debug logging - check what JWT_EXPIRES_IN is being used
console.log('🔧 JWT_CONFIG initialized:', {
  expiresIn: JWT_CONFIG.expiresIn,
  fromEnv: process.env.JWT_EXPIRES_IN,
  fallback: RBAC_CONSTANTS.JWT_EXPIRES_IN,
  usingEnv: !!process.env.JWT_EXPIRES_IN,
});

export class EnhancedJWTService {
  /**
   * Hash session ID to match session-manager's storage format
   */
  private static hashSessionId(sessionId: string): string {
    return createHash('sha256').update(sessionId).digest('hex');
  }

  /**
   * Generate a new JWT token with enhanced RBAC payload
   */
  static async generateToken(
    user: EnhancedAuthenticatedUser,
    sessionId: string
  ): Promise<string> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + this.parseExpiresIn(JWT_CONFIG.expiresIn);

      // Create enhanced JWT payload
      const payload: EnhancedJWTPayload = {
        // User Identity
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,

        // Role & Context
        currentRole: user.currentRole,
        availableRoles: user.availableRoles,
        restaurantContext: user.restaurantContext,

        // Permissions (computed)
        permissions: user.permissions,

        // Session Management
        sessionId,

        // JWT Standard Claims
        iat: now,
        exp,
        iss: JWT_CONFIG.issuer,
        sub: user.id,
      };

      // Generate JWT token
      const token = jwt.sign(payload, JWT_CONFIG.secret, {
        algorithm: JWT_CONFIG.algorithm,
      });

      // Update existing session with token hash
      const tokenHash = await this.hashToken(token);
      const hashedSessionId = this.hashSessionId(sessionId);

      await prisma.userSession.update({
        where: { sessionId: hashedSessionId },
        data: {
          jwtTokenHash: tokenHash,
          lastActivity: new Date(),
        },
      });

      return token;
    } catch (error) {
      console.error('JWT Generation Error:', error.message);
      throw new RBACError(
        `Failed to generate JWT token: ${error.message}`,
        'JWT_GENERATION_FAILED',
        500
      );
    }
  }

  /**
   * Verify and decode JWT token
   */
  static async verifyToken(token: string): Promise<EnhancedJWTPayload> {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 EnhancedJWTService.verifyToken: Starting verification');
        console.log('🔍 JWT_CONFIG:', {
          hasSecret: !!JWT_CONFIG.secret,
          secretLength: JWT_CONFIG.secret.length,
          expiresIn: JWT_CONFIG.expiresIn,
          issuer: JWT_CONFIG.issuer,
          algorithm: JWT_CONFIG.algorithm,
        });
      }

      // Verify JWT signature and decode
      const decoded = jwt.verify(token, JWT_CONFIG.secret) as jwt.JwtPayload;

      // Debug: Log decoded payload structure
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 JWT Decoded payload:', {
          hasUserId: typeof decoded.userId === 'string',
          hasEmail: typeof decoded.email === 'string',
          hasFirstName: typeof decoded.firstName === 'string',
          hasLastName: typeof decoded.lastName === 'string',
          hasCurrentRole: !!decoded.currentRole,
          hasAvailableRoles: Array.isArray(decoded.availableRoles),
          hasPermissions: Array.isArray(decoded.permissions),
          hasSessionId: typeof decoded.sessionId === 'string',
          hasIat: typeof decoded.iat === 'number',
          hasExp: typeof decoded.exp === 'number',
          hasIss: typeof decoded.iss === 'string',
          hasSub: typeof decoded.sub === 'string',
          actualStructure: Object.keys(decoded),
          permissions: decoded.permissions
            ? decoded.permissions.length
            : 'none',
        });
      }

      // Validate payload structure
      if (!isEnhancedJWTPayload(decoded)) {
        throw new InvalidTokenError('Invalid payload structure');
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp < now) {
        throw new SessionExpiredError();
      }

      // Verify session exists and is valid
      const tokenHash = await this.hashToken(token);
      const hashedSessionId = this.hashSessionId(decoded.sessionId);
      const session = await prisma.userSession.findFirst({
        where: {
          sessionId: hashedSessionId,
          jwtTokenHash: tokenHash,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!session) {
        throw new InvalidTokenError('Session not found or expired');
      }

      // Update last activity
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastActivity: new Date() },
      });

      return decoded;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🚫 EnhancedJWTService.verifyToken: Caught error:', {
          errorType: error.constructor.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3),
        });
      }

      if (error instanceof RBACError) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new SessionExpiredError();
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new InvalidTokenError(error.message);
      }

      throw new RBACError(
        'Token verification failed',
        'TOKEN_VERIFICATION_FAILED',
        401
      );
    }
  }

  /**
   * Refresh JWT token
   */
  static async refreshToken(currentToken: string): Promise<string> {
    try {
      // Verify current token
      const payload = await this.verifyToken(currentToken);

      // Get fresh user data
      const user = await this.reconstructUserFromPayload(payload);
      if (!user) {
        throw new InvalidTokenError('User not found');
      }

      // Invalidate old session
      await this.invalidateSession(payload.sessionId);

      // Generate new session ID and token
      const newSessionId = this.generateSessionId();
      const newToken = await this.generateToken(user, newSessionId);

      return newToken;
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }

      throw new RBACError('Token refresh failed', 'TOKEN_REFRESH_FAILED', 401);
    }
  }

  /**
   * Invalidate a session
   */
  static async invalidateSession(sessionId: string): Promise<void> {
    try {
      const hashedSessionId = this.hashSessionId(sessionId);
      await prisma.userSession.deleteMany({
        where: { sessionId: hashedSessionId },
      });
    } catch {
      // Silent fail - session might already be deleted
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  static async invalidateAllUserSessions(userId: string): Promise<void> {
    try {
      await prisma.userSession.deleteMany({
        where: { userId },
      });
    } catch {
      // Silent fail - sessions might already be deleted
    }
  }

  /**
   * Validate JWT payload structure
   */
  static validatePayload(payload: unknown): ValidationResult {
    const errors: string[] = [];

    if (!payload) {
      errors.push('Payload is required');
      return { isValid: false, errors };
    }

    // Check required fields
    const requiredFields = [
      'userId',
      'email',
      'firstName',
      'lastName',
      'currentRole',
      'availableRoles',
      'permissions',
      'sessionId',
      'iat',
      'exp',
      'iss',
      'sub',
    ];

    for (const field of requiredFields) {
      if (!payload[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate types
    if (payload.userId && typeof payload.userId !== 'string') {
      errors.push('userId must be a string');
    }

    if (payload.email && typeof payload.email !== 'string') {
      errors.push('email must be a string');
    }

    if (payload.permissions && !Array.isArray(payload.permissions)) {
      errors.push('permissions must be an array');
    }

    if (payload.availableRoles && !Array.isArray(payload.availableRoles)) {
      errors.push('availableRoles must be an array');
    }

    // Validate currentRole structure
    if (payload.currentRole) {
      const role = payload.currentRole;
      if (!role.id || !role.userType || !role.roleTemplate) {
        errors.push('currentRole must have id, userType, and roleTemplate');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Generate unique session ID
   */
  static generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Hash token for secure storage using Web Crypto API (Edge Runtime compatible)
   */
  static async hashToken(token: string): Promise<string> {
    try {
      // Use Web Crypto API for Edge Runtime compatibility
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hash = await crypto.subtle.digest('SHA-256', data);

      // Convert ArrayBuffer to hex string
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      // Fallback for Node.js environments
      if (typeof process !== 'undefined' && process.versions?.node) {
        const { createHash } = await import('crypto');
        return createHash('sha256').update(token).digest('hex');
      }
      throw error;
    }
  }

  /**
   * Parse expires in string to seconds
   */
  static parseExpiresIn(expiresIn: string): number {
    console.log('🔧 parseExpiresIn called with:', expiresIn);
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      console.log('❌ parseExpiresIn: No match, using default 24 hours');
      return 24 * 60 * 60; // Default 24 hours
    }

    const [, amount, unit] = match;
    const value = parseInt(amount, 10);

    console.log('✅ parseExpiresIn: Parsed', { amount, unit, value });

    switch (unit) {
      case 's':
        return value;
      case 'm':
        console.log('✅ parseExpiresIn: Returning', value * 60, 'seconds');
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 24 * 60 * 60;
    }
  }

  /**
   * Get JWT token expiration timestamp
   * Returns a Date object representing when the token will expire
   * based on the JWT_EXPIRES_IN configuration
   */
  static getTokenExpirationTime(): Date {
    const expiresInSeconds = this.parseExpiresIn(JWT_CONFIG.expiresIn);
    return new Date(Date.now() + expiresInSeconds * 1000);
  }

  /**
   * Reconstruct user from JWT payload
   */
  static async reconstructUserFromPayload(
    payload: EnhancedJWTPayload
  ): Promise<EnhancedAuthenticatedUser | null> {
    try {
      // Get user role from database to ensure it's still valid
      const userRole = await prisma.userRole.findFirst({
        where: {
          id: payload.currentRole.id,
          userId: payload.userId,
          isActive: true,
        },
        include: {
          restaurant: payload.currentRole.restaurantId
            ? {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  isActive: true,
                  timezone: true,
                  currency: true,
                },
              }
            : false,
        },
      });

      if (!userRole) {
        return null;
      }

      // Get mustChangePassword field from the actual user record
      let mustChangePassword = false;
      if (userRole.userType === 'staff') {
        const staff = await prisma.staff.findUnique({
          where: { id: payload.userId },
          select: { mustChangePassword: true },
        });
        mustChangePassword = staff?.mustChangePassword || false;
      } else if (userRole.userType === 'restaurant_owner') {
        const owner = await prisma.restaurantOwner.findUnique({
          where: { id: payload.userId },
          select: { mustChangePassword: true },
        });
        mustChangePassword = owner?.mustChangePassword || false;
      } else if (userRole.userType === 'platform_admin') {
        // Platform admins don't typically have mustChangePassword, but included for completeness
        mustChangePassword = false;
      }

      // Get all available roles for user
      const availableRoles = await prisma.userRole.findMany({
        where: {
          userId: payload.userId,
          isActive: true,
        },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              timezone: true,
              currency: true,
            },
          },
        },
      });

      // Get fresh permissions
      const permissions = await this.computeUserPermissions(payload.userId);

      return {
        id: payload.userId,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        userType: payload.currentRole.userType as
          | 'platform_admin'
          | 'restaurant_owner'
          | 'staff',
        currentRole: {
          id: userRole.id,
          userType: userRole.userType as
            | 'platform_admin'
            | 'restaurant_owner'
            | 'staff',
          roleTemplate: userRole.roleTemplate,
          restaurantId: userRole.restaurantId || undefined,
          customPermissions: userRole.customPermissions as string[],
          isActive: userRole.isActive,
        },
        availableRoles: availableRoles.map((role) => ({
          id: role.id,
          userType: role.userType as
            | 'platform_admin'
            | 'restaurant_owner'
            | 'staff',
          roleTemplate: role.roleTemplate,
          restaurantId: role.restaurantId || undefined,
          customPermissions: role.customPermissions as string[],
          isActive: role.isActive,
        })),
        restaurantContext: userRole.restaurant
          ? {
              id: userRole.restaurant.id,
              name: userRole.restaurant.name,
              slug: userRole.restaurant.slug,
              isActive: userRole.restaurant.isActive,
              timezone: userRole.restaurant.timezone,
              currency: userRole.restaurant.currency,
            }
          : undefined,
        permissions,
        isActive: true,
        mustChangePassword,
      };
    } catch {
      return null;
    }
  }

  /**
   * Compute user permissions from roles
   */
  static async computeUserPermissions(userId: string): Promise<string[]> {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: { userId, isActive: true },
      });

      const permissions = new Set<string>();

      for (const role of userRoles) {
        // Get template permissions
        const templatePermissions = await prisma.rolePermission.findMany({
          where: { roleTemplate: role.roleTemplate },
          include: {
            permission: true,
          },
        });

        // Add template permissions
        templatePermissions.forEach((rp) => {
          if (rp.permission.isActive) {
            permissions.add(rp.permission.permissionKey);
          }
        });

        // Add custom permissions
        if (role.customPermissions) {
          (role.customPermissions as string[]).forEach((p) =>
            permissions.add(p)
          );
        }
      }

      return Array.from(permissions);
    } catch {
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<void> {
    try {
      await prisma.userSession.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
    } catch {
      // Silent fail - cleanup is not critical
    }
  }

  /**
   * Get session info
   */
  static async getSessionInfo(sessionId: string): Promise<UserSession | null> {
    try {
      const hashedSessionId = this.hashSessionId(sessionId);
      const session = await prisma.userSession.findFirst({
        where: { sessionId: hashedSessionId },
      });

      if (!session) {
        return null;
      }

      return {
        id: session.id,
        userId: session.userId,
        sessionId: session.sessionId,
        currentRoleId: session.currentRoleId,
        restaurantContextId: session.restaurantContextId || undefined,
        jwtTokenHash: session.jwtTokenHash || undefined,
        permissions: session.permissions as string[],
        expiresAt: session.expiresAt,
        lastActivity: session.lastActivity,
        ipAddress: session.ipAddress || undefined,
        userAgent: session.userAgent || undefined,
      };
    } catch {
      return null;
    }
  }
}

// Export constants for use in other modules
export const JWT_CONSTANTS = {
  HEADER_NAME: 'authorization',
  COOKIE_NAME: 'qr_auth_token',
  BEARER_PREFIX: 'Bearer ',
  SESSION_CLEANUP_INTERVAL: RBAC_CONSTANTS.SESSION_CLEANUP_INTERVAL,
} as const;
