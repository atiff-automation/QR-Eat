/**
 * Legacy Token Support for RBAC Migration
 * 
 * This module provides backward compatibility for legacy authentication tokens
 * during the migration to the new RBAC system.
 */

import { NextRequest } from 'next/server';
import { EnhancedJWTService } from './jwt';
import { PermissionManager } from './permissions';
import { RoleManager } from './role-manager';
import { SessionManager } from './session-manager';
import { AuditLogger } from './audit-logger';
import { RBACError, UserRole } from './types';

interface LegacyTokenPayload {
  userId: string;
  userType: 'platform_admin' | 'restaurant_owner' | 'staff';
  restaurantId?: string;
  staffRoleId?: string;
  iat?: number;
  exp?: number;
}

interface LegacyTokenValidationResult {
  isValid: boolean;
  payload?: LegacyTokenPayload;
  error?: string;
  shouldUpgrade?: boolean;
}

export class LegacyTokenSupport {
  /**
   * Validate legacy token format
   */
  static async validateLegacyToken(
    token: string,
    request?: NextRequest
  ): Promise<LegacyTokenValidationResult> {
    try {
      // Try to decode the token
      const decoded = await EnhancedJWTService.verifyToken(token);
      
      // Check if this is a legacy token (missing RBAC fields)
      const isLegacyToken = !decoded.currentRole || !decoded.permissions || !decoded.sessionId;
      
      if (!isLegacyToken) {
        return {
          isValid: false,
          error: 'Token is not a legacy token',
          shouldUpgrade: false
        };
      }

      // Validate legacy token structure
      const payload = decoded as LegacyTokenPayload;
      
      if (!payload.userId || !payload.userType) {
        return {
          isValid: false,
          error: 'Invalid legacy token structure',
          shouldUpgrade: false
        };
      }

      // Log legacy token usage for monitoring
      await AuditLogger.logSecurityEvent(
        payload.userId,
        'LEGACY_TOKEN_USED',
        'low',
        'Legacy token detected and validated',
        AuditLogger.extractContextFromRequest(request)
      );

      return {
        isValid: true,
        payload,
        shouldUpgrade: true
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Token validation failed',
        shouldUpgrade: false
      };
    }
  }

  /**
   * Upgrade legacy token to new RBAC token
   */
  static async upgradeLegacyToken(
    legacyToken: string,
    request?: NextRequest
  ): Promise<{
    success: boolean;
    newToken?: string;
    error?: string;
    userRole?: UserRole;
  }> {
    try {
      // Validate legacy token first
      const validation = await this.validateLegacyToken(legacyToken, request);
      
      if (!validation.isValid || !validation.payload) {
        return {
          success: false,
          error: validation.error || 'Invalid legacy token'
        };
      }

      const { userId, userType, restaurantId, staffRoleId } = validation.payload;

      // Get user's RBAC role
      const userRoles = await RoleManager.getUserRoles(userId);
      
      if (userRoles.length === 0) {
        return {
          success: false,
          error: 'User has no RBAC roles assigned'
        };
      }

      // Find the appropriate role based on context
      let selectedRole: UserRole;
      
      if (userType === 'platform_admin') {
        selectedRole = userRoles.find(r => r.userType === 'platform_admin') || userRoles[0];
      } else if (userType === 'restaurant_owner') {
        selectedRole = userRoles.find(r => 
          r.userType === 'restaurant_owner' && 
          r.restaurantId === restaurantId
        ) || userRoles[0];
      } else if (userType === 'staff') {
        selectedRole = userRoles.find(r => 
          r.userType === 'staff' && 
          r.restaurantId === restaurantId
        ) || userRoles[0];
      } else {
        selectedRole = userRoles[0];
      }

      // Create new session for the upgraded token
      const context = AuditLogger.extractContextFromRequest(request);
      const sessionResult = await SessionManager.createSession({
        userId,
        userRole: selectedRole,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          upgradedFromLegacy: true,
          originalUserType: userType,
          originalRestaurantId: restaurantId,
          originalStaffRoleId: staffRoleId
        }
      });

      // Get user permissions
      const permissions = await PermissionManager.getUserPermissions(userId);
      
      // Create enhanced user object for token generation
      const enhancedUser = {
        id: userId,
        email: '', // Will be filled from actual user data
        firstName: '', // Will be filled from actual user data
        lastName: '', // Will be filled from actual user data
        userType: selectedRole.userType,
        currentRole: selectedRole,
        availableRoles: userRoles,
        restaurantContext: selectedRole.restaurantId ? {
          id: selectedRole.restaurantId,
          name: '',
          slug: '',
          isActive: true,
          timezone: 'UTC',
          currency: 'USD'
        } : undefined,
        permissions,
        isActive: true
      };

      // Generate new RBAC token
      const newToken = await EnhancedJWTService.generateToken(
        enhancedUser,
        sessionResult.sessionId,
        context.ipAddress,
        context.userAgent
      );

      // Log the upgrade
      await AuditLogger.logSecurityEvent(
        userId,
        'LEGACY_TOKEN_UPGRADED',
        'low',
        'Legacy token successfully upgraded to RBAC token',
        {
          ...context,
          metadata: {
            fromUserType: userType,
            toRoleTemplate: selectedRole.roleTemplate,
            sessionId: sessionResult.sessionId
          }
        }
      );

      return {
        success: true,
        newToken,
        userRole: selectedRole
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token upgrade failed'
      };
    }
  }

  /**
   * Check if token needs upgrading
   */
  static async shouldUpgradeToken(token: string): Promise<boolean> {
    try {
      const validation = await this.validateLegacyToken(token);
      return validation.shouldUpgrade || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract legacy user context for migration
   */
  static async extractLegacyContext(
    token: string
  ): Promise<{
    userId: string;
    userType: string;
    restaurantId?: string;
    staffRoleId?: string;
  } | null> {
    try {
      const validation = await this.validateLegacyToken(token);
      
      if (!validation.isValid || !validation.payload) {
        return null;
      }

      return {
        userId: validation.payload.userId,
        userType: validation.payload.userType,
        restaurantId: validation.payload.restaurantId,
        staffRoleId: validation.payload.staffRoleId
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get legacy token statistics for monitoring
   */
  static async getLegacyTokenStats(): Promise<{
    totalLegacyTokensUsed: number;
    totalUpgrades: number;
    recentLegacyActivity: Array<{
      userId: string;
      timestamp: Date;
      upgraded: boolean;
    }>;
  }> {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get legacy token usage from audit logs
      const auditSummary = await AuditLogger.getAuditSummary(last24Hours);
      
      // Count legacy token events
      const legacyTokenUsed = auditSummary.actionCounts['SECURITY_EVENT'] || 0;
      const legacyTokenUpgraded = auditSummary.actionCounts['SECURITY_EVENT'] || 0;

      // Get recent activity (simplified for now)
      const recentActivity = auditSummary.recentActivity
        .filter(entry => 
          entry.action === 'SECURITY_EVENT' &&
          entry.metadata?.eventType === 'LEGACY_TOKEN_USED'
        )
        .slice(0, 10)
        .map(entry => ({
          userId: entry.userId,
          timestamp: entry.createdAt,
          upgraded: entry.metadata?.eventType === 'LEGACY_TOKEN_UPGRADED'
        }));

      return {
        totalLegacyTokensUsed: legacyTokenUsed,
        totalUpgrades: legacyTokenUpgraded,
        recentLegacyActivity: recentActivity
      };
    } catch (error) {
      throw new RBACError(
        'Failed to get legacy token statistics',
        'GET_LEGACY_TOKEN_STATS_FAILED',
        500
      );
    }
  }

  /**
   * Create migration report for legacy tokens
   */
  static async createMigrationReport(): Promise<{
    summary: string;
    recommendations: string[];
    stats: {
      totalLegacyTokensUsed: number;
      totalUpgrades: number;
      recentLegacyActivity: number;
    };
  }> {
    try {
      const stats = await this.getLegacyTokenStats();
      
      const summary = `Legacy Token Migration Report:
- Total legacy tokens used in last 24h: ${stats.totalLegacyTokensUsed}
- Total successful upgrades: ${stats.totalUpgrades}
- Recent legacy activity: ${stats.recentLegacyActivity.length} events`;

      const recommendations = [
        'Monitor legacy token usage and plan for deprecation',
        'Encourage users to re-authenticate to get new RBAC tokens',
        'Set up alerts for excessive legacy token usage',
        'Plan timeline for removing legacy token support'
      ];

      if (stats.totalLegacyTokensUsed > 100) {
        recommendations.push('High legacy token usage detected - consider communication to users');
      }

      if (stats.totalUpgrades < stats.totalLegacyTokensUsed * 0.8) {
        recommendations.push('Low upgrade rate - investigate upgrade failures');
      }

      return {
        summary,
        recommendations,
        stats: {
          totalLegacyTokensUsed: stats.totalLegacyTokensUsed,
          totalUpgrades: stats.totalUpgrades,
          recentLegacyActivity: stats.recentLegacyActivity.length
        }
      };
    } catch (error) {
      throw new RBACError(
        'Failed to create migration report',
        'CREATE_MIGRATION_REPORT_FAILED',
        500
      );
    }
  }
}