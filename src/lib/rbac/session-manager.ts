/**
 * Session Management System for RBAC
 * 
 * This file implements comprehensive session management for the enhanced RBAC system,
 * replacing the problematic multi-cookie approach with secure session tracking.
 */

import { randomUUID } from 'crypto';
import { prisma } from '@/lib/database';
import {
  UserSession,
  UserRole,
  RestaurantContext,
  RBAC_CONSTANTS,
  RBACError,
  SessionExpiredError
} from './types';

// Session creation parameters
export interface CreateSessionParams {
  userId: string;
  currentRoleId: string;
  restaurantContextId?: string;
  permissions: string[];
  ipAddress?: string;
  userAgent?: string;
}

// Session update parameters
export interface UpdateSessionParams {
  currentRoleId?: string;
  restaurantContextId?: string;
  permissions?: string[];
  lastActivity?: Date;
}

// Session with included relations
export interface SessionWithRelations extends UserSession {
  currentRole?: UserRole;
  restaurantContext?: RestaurantContext;
}

export class SessionManager {
  /**
   * Create a new user session
   */
  static async createSession(params: CreateSessionParams): Promise<UserSession> {
    try {
      // First, clean up any existing sessions for this user to prevent conflicts
      await this.cleanupUserSessions(params.userId);
      
      // Generate a unique session ID with timestamp to ensure uniqueness
      const sessionId = `${randomUUID()}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + RBAC_CONSTANTS.SESSION_TIMEOUT);

      const session = await prisma.userSession.create({
        data: {
          userId: params.userId,
          sessionId,
          currentRoleId: params.currentRoleId,
          restaurantContextId: params.restaurantContextId,
          permissions: params.permissions,
          expiresAt,
          lastActivity: new Date(),
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        }
      });

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
        userAgent: session.userAgent || undefined
      };
    } catch (error) {
      throw new RBACError(
        'Failed to create session',
        'SESSION_CREATION_FAILED',
        500
      );
    }
  }

  /**
   * Get session by session ID
   */
  static async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      const session = await prisma.userSession.findUnique({
        where: { sessionId }
      });

      if (!session) {
        return null;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        // Clean up expired session
        await this.invalidateSession(sessionId);
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
        userAgent: session.userAgent || undefined
      };
    } catch (error) {
      throw new RBACError(
        'Failed to get session',
        'GET_SESSION_FAILED',
        500
      );
    }
  }

  /**
   * Get session with included relations
   */
  static async getSessionWithRelations(sessionId: string): Promise<SessionWithRelations | null> {
    try {
      const session = await prisma.userSession.findUnique({
        where: { sessionId },
        include: {
          currentRole: {
            include: {
              restaurant: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  isActive: true,
                  timezone: true,
                  currency: true
                }
              }
            }
          },
          restaurantContext: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              timezone: true,
              currency: true
            }
          }
        }
      });

      if (!session) {
        return null;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(sessionId);
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
        currentRole: session.currentRole ? {
          id: session.currentRole.id,
          userType: session.currentRole.userType as any,
          roleTemplate: session.currentRole.roleTemplate,
          restaurantId: session.currentRole.restaurantId || undefined,
          customPermissions: session.currentRole.customPermissions as string[],
          isActive: session.currentRole.isActive
        } : undefined,
        restaurantContext: session.restaurantContext ? {
          id: session.restaurantContext.id,
          name: session.restaurantContext.name,
          slug: session.restaurantContext.slug,
          isActive: session.restaurantContext.isActive,
          timezone: session.restaurantContext.timezone,
          currency: session.restaurantContext.currency
        } : undefined
      };
    } catch (error) {
      throw new RBACError(
        'Failed to get session with relations',
        'GET_SESSION_RELATIONS_FAILED',
        500
      );
    }
  }

  /**
   * Update session data
   */
  static async updateSession(
    sessionId: string, 
    updates: UpdateSessionParams
  ): Promise<void> {
    try {
      await prisma.userSession.update({
        where: { sessionId },
        data: {
          ...updates,
          lastActivity: new Date()
        }
      });
    } catch (error) {
      throw new RBACError(
        'Failed to update session',
        'UPDATE_SESSION_FAILED',
        500
      );
    }
  }

  /**
   * Update session last activity
   */
  static async updateLastActivity(sessionId: string): Promise<void> {
    try {
      await prisma.userSession.update({
        where: { sessionId },
        data: { lastActivity: new Date() }
      });
    } catch (error) {
      // Silent fail - not critical
    }
  }

  /**
   * Update session JWT token hash
   */
  static async updateTokenHash(sessionId: string, tokenHash: string): Promise<void> {
    try {
      await prisma.userSession.update({
        where: { sessionId },
        data: { 
          jwtTokenHash: tokenHash,
          lastActivity: new Date()
        }
      });
    } catch (error) {
      throw new RBACError(
        'Failed to update token hash',
        'UPDATE_TOKEN_HASH_FAILED',
        500
      );
    }
  }

  /**
   * Invalidate a specific session
   */
  static async invalidateSession(sessionId: string): Promise<void> {
    try {
      await prisma.userSession.delete({
        where: { sessionId }
      });
    } catch (error) {
      // Silent fail - session might already be deleted
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  static async invalidateAllUserSessions(userId: string): Promise<void> {
    try {
      await prisma.userSession.deleteMany({
        where: { userId }
      });
    } catch (error) {
      throw new RBACError(
        'Failed to invalidate user sessions',
        'INVALIDATE_USER_SESSIONS_FAILED',
        500
      );
    }
  }

  /**
   * Invalidate all sessions for a user except current
   */
  static async invalidateOtherUserSessions(userId: string, currentSessionId: string): Promise<void> {
    try {
      await prisma.userSession.deleteMany({
        where: {
          userId,
          sessionId: { not: currentSessionId }
        }
      });
    } catch (error) {
      throw new RBACError(
        'Failed to invalidate other user sessions',
        'INVALIDATE_OTHER_SESSIONS_FAILED',
        500
      );
    }
  }

  /**
   * Clean up existing sessions for a user
   */
  static async cleanupUserSessions(userId: string): Promise<number> {
    try {
      const result = await prisma.userSession.deleteMany({
        where: { userId }
      });
      return result.count;
    } catch (error) {
      throw new RBACError(
        'Failed to cleanup user sessions',
        'CLEANUP_USER_SESSIONS_FAILED',
        500
      );
    }
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });
      return result.count;
    } catch (error) {
      throw new RBACError(
        'Failed to cleanup expired sessions',
        'CLEANUP_SESSIONS_FAILED',
        500
      );
    }
  }

  /**
   * Extend session expiration
   */
  static async extendSession(sessionId: string, additionalTime?: number): Promise<void> {
    try {
      const extension = additionalTime || RBAC_CONSTANTS.SESSION_TIMEOUT;
      const newExpiresAt = new Date(Date.now() + extension);

      await prisma.userSession.update({
        where: { sessionId },
        data: {
          expiresAt: newExpiresAt,
          lastActivity: new Date()
        }
      });
    } catch (error) {
      throw new RBACError(
        'Failed to extend session',
        'EXTEND_SESSION_FAILED',
        500
      );
    }
  }

  /**
   * Get all active sessions for a user
   */
  static async getUserSessions(userId: string): Promise<UserSession[]> {
    try {
      const sessions = await prisma.userSession.findMany({
        where: {
          userId,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: { lastActivity: 'desc' }
      });

      return sessions.map(session => ({
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
        userAgent: session.userAgent || undefined
      }));
    } catch (error) {
      throw new RBACError(
        'Failed to get user sessions',
        'GET_USER_SESSIONS_FAILED',
        500
      );
    }
  }

  /**
   * Get session statistics
   */
  static async getSessionStatistics(): Promise<{
    totalActiveSessions: number;
    sessionsByUserType: Record<string, number>;
    expiredSessionsCount: number;
    averageSessionDuration: number;
  }> {
    try {
      const now = new Date();

      // Get active sessions
      const activeSessions = await prisma.userSession.findMany({
        where: {
          expiresAt: { gt: now }
        },
        include: {
          currentRole: {
            select: { userType: true }
          }
        }
      });

      // Get expired sessions count
      const expiredCount = await prisma.userSession.count({
        where: {
          expiresAt: { lte: now }
        }
      });

      // Calculate statistics
      const sessionsByUserType: Record<string, number> = {};
      let totalDuration = 0;

      activeSessions.forEach(session => {
        const userType = session.currentRole?.userType || 'unknown';
        sessionsByUserType[userType] = (sessionsByUserType[userType] || 0) + 1;
        
        const duration = now.getTime() - session.createdAt.getTime();
        totalDuration += duration;
      });

      const averageSessionDuration = activeSessions.length > 0 
        ? totalDuration / activeSessions.length 
        : 0;

      return {
        totalActiveSessions: activeSessions.length,
        sessionsByUserType,
        expiredSessionsCount: expiredCount,
        averageSessionDuration
      };
    } catch (error) {
      throw new RBACError(
        'Failed to get session statistics',
        'GET_SESSION_STATISTICS_FAILED',
        500
      );
    }
  }

  /**
   * Validate session and ensure it's not expired
   */
  static async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      return session !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get session timeout duration in milliseconds
   */
  static getSessionTimeout(): number {
    return RBAC_CONSTANTS.SESSION_TIMEOUT;
  }

  /**
   * Check if session is near expiration (within 1 hour)
   */
  static isSessionNearExpiration(session: UserSession): boolean {
    const oneHour = 60 * 60 * 1000;
    const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
    return timeUntilExpiry <= oneHour && timeUntilExpiry > 0;
  }

  /**
   * Generate session activity summary
   */
  static generateSessionSummary(session: UserSession): {
    duration: number;
    timeUntilExpiry: number;
    isActive: boolean;
    isNearExpiration: boolean;
  } {
    const now = Date.now();
    const duration = now - session.lastActivity.getTime();
    const timeUntilExpiry = session.expiresAt.getTime() - now;
    const isActive = timeUntilExpiry > 0;
    const isNearExpiration = this.isSessionNearExpiration(session);

    return {
      duration,
      timeUntilExpiry,
      isActive,
      isNearExpiration
    };
  }
}