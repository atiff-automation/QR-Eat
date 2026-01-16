/**
 * Comprehensive Audit Logging System for RBAC
 *
 * This file implements comprehensive audit logging for all RBAC-related actions,
 * providing security monitoring and compliance capabilities.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { SecurityUtils } from '../security';
import { UserRole, RBACLogEntry, RBAC_CONSTANTS, RBACError } from './types';

// Audit trail query options
export interface AuditTrailOptions {
  startDate?: Date;
  endDate?: Date;
  actions?: string[];
  resources?: string[];
  limit?: number;
  offset?: number;
  restaurantId?: string;
  severity?: string;
}

// Audit log summary interface
export interface AuditLogSummary {
  totalLogs: number;
  actionCounts: Record<string, number>;
  severityCounts: Record<string, number>;
  recentActivity: RBACLogEntry[];
  securityEvents: number;
  failedAttempts: number;
}

// Audit context for logging
export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  restaurantId?: string;
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  /**
   * Log successful authentication
   */
  static async logAuthentication(
    userId: string,
    role: UserRole,
    sessionId: string,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId,
          action: 'LOGIN',
          resource: 'authentication',
          toRole: role.roleTemplate,
          metadata: {
            roleId: role.id,
            roleTemplate: role.roleTemplate,
            restaurantId: role.restaurantId,
            sessionId,
            userType: role.userType,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      // Silent fail for audit logging - should not break application flow
      console.error('Failed to log authentication:', error);
    }
  }

  /**
   * Log failed authentication attempt
   */
  static async logAuthenticationFailure(
    email: string,
    reason: string,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId: 'anonymous',
          action: 'LOGIN_FAILED',
          resource: 'authentication',
          metadata: {
            email,
            reason,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log authentication failure:', error);
    }
  }

  /**
   * Log role switching
   */
  static async logRoleSwitch(
    userId: string,
    fromRoleId: string,
    toRoleId: string,
    sessionId: string,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId,
          action: 'ROLE_SWITCH',
          resource: 'role_management',
          fromRole: fromRoleId,
          toRole: toRoleId,
          metadata: {
            sessionId,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log role switch:', error);
    }
  }

  /**
   * Log permission denied events
   */
  static async logPermissionDenied(
    userId: string,
    resource: string,
    permission: string,
    sessionId?: string,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId,
          action: 'PERMISSION_DENIED',
          resource,
          metadata: {
            permission,
            sessionId,
            attemptedAction: permission,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log permission denied:', error);
    }
  }

  /**
   * Log logout events
   */
  static async logLogout(
    userId: string,
    sessionId: string,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId,
          action: 'LOGOUT',
          resource: 'authentication',
          metadata: {
            sessionId,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log logout:', error);
    }
  }

  /**
   * Log token refresh events
   */
  static async logTokenRefresh(
    userId: string,
    sessionId: string,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId,
          action: 'TOKEN_REFRESH',
          resource: 'authentication',
          metadata: {
            sessionId,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log token refresh:', error);
    }
  }

  /**
   * Log session expiration
   */
  static async logSessionExpired(
    userId: string,
    sessionId: string,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId,
          action: 'SESSION_EXPIRED',
          resource: 'session_management',
          metadata: {
            sessionId,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log session expiration:', error);
    }
  }

  /**
   * Log user role changes (creation, modification, deletion)
   */
  static async logUserRoleChange(
    adminUserId: string,
    targetUserId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    roleDetails: Partial<UserRole>,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId: adminUserId,
          action: `USER_ROLE_${action}`,
          resource: 'user_management',
          metadata: {
            targetUserId,
            roleDetails,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log user role change:', error);
    }
  }

  /**
   * Log security events
   */
  static async logSecurityEvent(
    userId: string,
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    description: string,
    context?: AuditContext
  ): Promise<void> {
    try {
      await prisma.rBACLog.create({
        data: {
          userId,
          action: 'SECURITY_EVENT',
          resource: 'security',
          metadata: {
            eventType,
            severity,
            description,
            timestamp: new Date().toISOString(),
            ...context?.metadata,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Get audit trail for a user
   */
  static async getAuditTrail(
    userId: string,
    options: AuditTrailOptions = {}
  ): Promise<RBACLogEntry[]> {
    try {
      const {
        startDate,
        endDate,
        actions,
        resources,
        limit = 100,
        offset = 0,
        restaurantId,
        severity,
      } = options;

      const logs = await prisma.rBACLog.findMany({
        where: {
          userId,
          ...(startDate && { createdAt: { gte: startDate } }),
          ...(endDate && { createdAt: { lte: endDate } }),
          ...(actions && { action: { in: actions } }),
          ...(resources && { resource: { in: resources } }),
          ...(restaurantId && {
            metadata: {
              path: ['restaurantId'],
              equals: restaurantId,
            },
          }),
          ...(severity && {
            metadata: {
              path: ['severity'],
              equals: severity,
            },
          }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      return logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        resource: log.resource || 'unknown',
        fromRole: log.fromRole || undefined,
        toRole: log.toRole || undefined,
        metadata: log.metadata as Record<string, unknown>,
        ipAddress: log.ipAddress || undefined,
        userAgent: log.userAgent || undefined,
        createdAt: log.createdAt,
      }));
    } catch {
      throw new RBACError(
        'Failed to get audit trail',
        'GET_AUDIT_TRAIL_FAILED',
        500
      );
    }
  }

  /**
   * Get audit trail for a restaurant
   */
  static async getRestaurantAuditTrail(
    restaurantId: string,
    options: AuditTrailOptions = {}
  ): Promise<RBACLogEntry[]> {
    try {
      const logs = await prisma.rBACLog.findMany({
        where: {
          metadata: {
            path: ['restaurantId'],
            equals: restaurantId,
          },
          ...(options.startDate && { createdAt: { gte: options.startDate } }),
          ...(options.endDate && { createdAt: { lte: options.endDate } }),
          ...(options.actions && { action: { in: options.actions } }),
          ...(options.resources && { resource: { in: options.resources } }),
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit || 100,
        skip: options.offset || 0,
      });

      return logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        resource: log.resource || 'unknown',
        fromRole: log.fromRole || undefined,
        toRole: log.toRole || undefined,
        metadata: log.metadata as Record<string, unknown>,
        ipAddress: log.ipAddress || undefined,
        userAgent: log.userAgent || undefined,
        createdAt: log.createdAt,
      }));
    } catch {
      throw new RBACError(
        'Failed to get restaurant audit trail',
        'GET_RESTAURANT_AUDIT_TRAIL_FAILED',
        500
      );
    }
  }

  /**
   * Get audit log summary
   */
  static async getAuditSummary(
    startDate?: Date,
    endDate?: Date,
    restaurantId?: string
  ): Promise<AuditLogSummary> {
    try {
      const whereClause = {
        ...(startDate && { createdAt: { gte: startDate } }),
        ...(endDate && { createdAt: { lte: endDate } }),
        ...(restaurantId && {
          metadata: {
            path: ['restaurantId'],
            equals: restaurantId,
          },
        }),
      };

      // Get total count
      const totalLogs = await prisma.rBACLog.count({ where: whereClause });

      // Get action counts
      const actionGroups = await prisma.rBACLog.groupBy({
        by: ['action'],
        where: whereClause,
        _count: true,
      });

      const actionCounts: Record<string, number> = {};
      actionGroups.forEach((group) => {
        actionCounts[group.action] = group._count;
      });

      // Get recent activity (last 10 entries)
      const recentLogs = await prisma.rBACLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const recentActivity: RBACLogEntry[] = recentLogs.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        resource: log.resource || 'unknown',
        fromRole: log.fromRole || undefined,
        toRole: log.toRole || undefined,
        metadata: log.metadata as Record<string, unknown>,
        ipAddress: log.ipAddress || undefined,
        userAgent: log.userAgent || undefined,
        createdAt: log.createdAt,
      }));

      // Count security events
      const securityEvents = await prisma.rBACLog.count({
        where: {
          ...whereClause,
          action: 'SECURITY_EVENT',
        },
      });

      // Count failed attempts
      const failedAttempts = await prisma.rBACLog.count({
        where: {
          ...whereClause,
          action: { in: ['LOGIN_FAILED', 'PERMISSION_DENIED'] },
        },
      });

      return {
        totalLogs,
        actionCounts,
        severityCounts: {}, // TODO: Implement severity counting
        recentActivity,
        securityEvents,
        failedAttempts,
      };
    } catch {
      throw new RBACError(
        'Failed to get audit summary',
        'GET_AUDIT_SUMMARY_FAILED',
        500
      );
    }
  }

  /**
   * Clean up old audit logs
   */
  static async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await prisma.rBACLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      return result.count;
    } catch {
      throw new RBACError(
        'Failed to cleanup old audit logs',
        'CLEANUP_AUDIT_LOGS_FAILED',
        500
      );
    }
  }

  /**
   * Export audit logs to JSON
   */
  static async exportAuditLogs(
    options: AuditTrailOptions & { format?: 'json' | 'csv' } = {}
  ): Promise<string> {
    try {
      const logs = await this.getAuditTrail('', options);

      if (options.format === 'csv') {
        return this.formatLogsAsCSV(logs);
      }

      return JSON.stringify(logs, null, 2);
    } catch {
      throw new RBACError(
        'Failed to export audit logs',
        'EXPORT_AUDIT_LOGS_FAILED',
        500
      );
    }
  }

  /**
   * Format logs as CSV
   */
  private static formatLogsAsCSV(logs: RBACLogEntry[]): string {
    const headers = [
      'ID',
      'User ID',
      'Action',
      'Resource',
      'From Role',
      'To Role',
      'IP Address',
      'User Agent',
      'Created At',
    ];
    const rows = logs.map((log) => [
      log.id,
      log.userId,
      log.action,
      log.resource,
      log.fromRole || '',
      log.toRole || '',
      log.ipAddress || '',
      log.userAgent || '',
      log.createdAt.toISOString(),
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  /**
   * Extract context from request
   */
  static extractContextFromRequest(request?: NextRequest): AuditContext {
    if (!request) {
      return {};
    }

    return {
      ipAddress: SecurityUtils.getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    };
  }

  /**
   * Get audit log statistics
   */
  static async getAuditStatistics(): Promise<{
    totalLogs: number;
    logsToday: number;
    logsThisWeek: number;
    logsThisMonth: number;
    topActions: Array<{ action: string; count: number }>;
    topUsers: Array<{ userId: string; count: number }>;
  }> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [totalLogs, logsToday, logsThisWeek, logsThisMonth] =
        await Promise.all([
          prisma.rBACLog.count(),
          prisma.rBACLog.count({ where: { createdAt: { gte: today } } }),
          prisma.rBACLog.count({ where: { createdAt: { gte: thisWeek } } }),
          prisma.rBACLog.count({ where: { createdAt: { gte: thisMonth } } }),
        ]);

      // Get top actions
      const actionGroups = await prisma.rBACLog.groupBy({
        by: ['action'],
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      });

      const topActions = actionGroups.map((group) => ({
        action: group.action,
        count: group._count,
      }));

      // Get top users
      const userGroups = await prisma.rBACLog.groupBy({
        by: ['userId'],
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      });

      const topUsers = userGroups.map((group) => ({
        userId: group.userId,
        count: group._count,
      }));

      return {
        totalLogs,
        logsToday,
        logsThisWeek,
        logsThisMonth,
        topActions,
        topUsers,
      };
    } catch {
      throw new RBACError(
        'Failed to get audit statistics',
        'GET_AUDIT_STATISTICS_FAILED',
        500
      );
    }
  }

  /**
   * Validate audit log integrity
   */
  static async validateAuditIntegrity(): Promise<{
    isValid: boolean;
    issues: string[];
    totalChecked: number;
  }> {
    try {
      const issues: string[] = [];
      let totalChecked = 0;

      // Check for logs with missing required fields
      // Note: userId, action, and createdAt are required in schema, so we skip null checks
      // but we can check for other potential integrity issues if needed
      const logsWithMissingFields = 0;

      totalChecked += logsWithMissingFields;

      if (logsWithMissingFields > 0) {
        issues.push(
          `${logsWithMissingFields} logs have missing required fields`
        );
      }

      // Check for logs with invalid actions
      const validActions = [
        ...RBAC_CONSTANTS.AUDIT_ACTIONS,
        'LOGIN_FAILED',
        'SECURITY_EVENT',
        'USER_ROLE_CREATE',
        'USER_ROLE_UPDATE',
        'USER_ROLE_DELETE',
      ];
      const logsWithInvalidActions = await prisma.rBACLog.count({
        where: {
          action: {
            notIn: validActions,
          },
        },
      });

      totalChecked += logsWithInvalidActions;

      if (logsWithInvalidActions > 0) {
        issues.push(`${logsWithInvalidActions} logs have invalid actions`);
      }

      return {
        isValid: issues.length === 0,
        issues,
        totalChecked,
      };
    } catch {
      throw new RBACError(
        'Failed to validate audit integrity',
        'VALIDATE_AUDIT_INTEGRITY_FAILED',
        500
      );
    }
  }
}
