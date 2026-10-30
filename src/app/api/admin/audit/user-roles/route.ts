/**
 * User Role Audit History API
 *
 * Reads role-change events from the canonical RBAC log. Role changes are
 * written by AuditLogger.logUserRoleChange into `rbac_logs`, with the target
 * user stored in metadata.targetUserId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/database';
import { SecurityUtils } from '@/lib/security';

type RoleAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTIVATE' | 'DEACTIVATE';
type Severity = 'low' | 'medium' | 'high';

const SYSTEM_ACTOR = {
  id: 'system',
  email: 'system@system.local',
  firstName: 'System',
  lastName: 'Admin',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined;
}

function roleAction(action: string): RoleAction {
  const suffix = action.startsWith('USER_ROLE_')
    ? action.slice('USER_ROLE_'.length)
    : action;

  if (
    suffix === 'CREATE' ||
    suffix === 'UPDATE' ||
    suffix === 'DELETE' ||
    suffix === 'ACTIVATE' ||
    suffix === 'DEACTIVATE'
  ) {
    return suffix;
  }

  return 'UPDATE';
}

function actionSeverity(action: RoleAction): Severity {
  if (action === 'DELETE' || action === 'DEACTIVATE') return 'high';
  if (action === 'UPDATE') return 'medium';
  return 'low';
}

function buildWhere(
  userId: string,
  action: string | null,
  startDate: string | null,
  endDate: string | null
): Prisma.RBACLogWhereInput {
  const where: Prisma.RBACLogWhereInput = {
    metadata: { path: ['targetUserId'], equals: userId },
    action:
      action && action !== 'all'
        ? `USER_ROLE_${action}`
        : { startsWith: 'USER_ROLE_' },
  };

  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
    };
  }

  return where;
}

// GET /api/admin/audit/user-roles - Get user role audit history
export async function GET(request: NextRequest) {
  try {
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['users:read'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 50 },
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    if (!authResult.context) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { context } = authResult;
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const action = url.searchParams.get('action');
    const severity = url.searchParams.get('severity');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const targetUser =
      (await prisma.platformAdmin.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      })) ||
      (await prisma.restaurantOwner.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      })) ||
      (await prisma.staff.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      }));

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const where = buildWhere(userId, action, startDate, endDate);
    const [logs, totalCount] = await Promise.all([
      prisma.rBACLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.rBACLog.count({ where }),
    ]);

    const actorIds = [...new Set(logs.map((log) => log.userId))];
    const [admins, owners, staff] = await Promise.all([
      actorIds.length
        ? prisma.platformAdmin.findMany({
            where: { id: { in: actorIds } },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          })
        : Promise.resolve([]),
      actorIds.length
        ? prisma.restaurantOwner.findMany({
            where: { id: { in: actorIds } },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          })
        : Promise.resolve([]),
      actorIds.length
        ? prisma.staff.findMany({
            where: { id: { in: actorIds } },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const actorMap = new Map(
      [...admins, ...owners, ...staff].map((actor) => [actor.id, actor])
    );

    let entries = logs.map((log) => {
      const metadata = isRecord(log.metadata) ? log.metadata : {};
      const roleDetails = isRecord(metadata.roleDetails)
        ? metadata.roleDetails
        : {};
      const changes = isRecord(metadata.changes) ? metadata.changes : undefined;
      const restaurant = isRecord(roleDetails.restaurant)
        ? roleDetails.restaurant
        : undefined;
      const role = roleAction(log.action);
      const performedBy = actorMap.get(log.userId) || SYSTEM_ACTOR;

      return {
        id: log.id,
        userId: stringValue(metadata.targetUserId) || userId,
        action: role,
        actionType: 'role_assignment' as const,
        performedBy,
        timestamp: log.createdAt.toISOString(),
        details: {
          roleTemplate: stringValue(roleDetails.roleTemplate),
          userType: stringValue(roleDetails.userType),
          restaurantId: stringValue(roleDetails.restaurantId),
          restaurant: restaurant
            ? {
                id: stringValue(restaurant.id) || '',
                name: stringValue(restaurant.name) || '',
                slug: stringValue(restaurant.slug) || '',
              }
            : undefined,
          changes: changes
            ? {
                before: isRecord(changes.before) ? changes.before : undefined,
                after: isRecord(changes.after) ? changes.after : undefined,
              }
            : undefined,
          customPermissions: stringArray(roleDetails.customPermissions),
          reason: stringValue(metadata.reason),
        },
        metadata: {
          ipAddress: log.ipAddress || 'unknown',
          userAgent: log.userAgent || 'unknown',
          sessionId: log.sessionId || undefined,
          source: 'admin_panel' as const,
        },
        severity: actionSeverity(role),
      };
    });

    if (severity && severity !== 'all') {
      entries = entries.filter((entry) => entry.severity === severity);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      entries = entries.filter(
        (entry) =>
          entry.performedBy.email.toLowerCase().includes(searchLower) ||
          entry.performedBy.firstName.toLowerCase().includes(searchLower) ||
          entry.performedBy.lastName.toLowerCase().includes(searchLower) ||
          entry.details.roleTemplate?.toLowerCase().includes(searchLower) ||
          entry.details.restaurant?.name.toLowerCase().includes(searchLower) ||
          entry.action.toLowerCase().includes(searchLower)
      );
    }

    const actionBreakdown = Object.entries(
      entries.reduce<Record<string, number>>((breakdown, entry) => {
        breakdown[entry.action] = (breakdown[entry.action] || 0) + 1;
        return breakdown;
      }, {})
    ).map(([entryAction, count]) => ({ action: entryAction, count }));

    const severityBreakdown = Object.entries(
      entries.reduce<Record<string, number>>((breakdown, entry) => {
        breakdown[entry.severity] = (breakdown[entry.severity] || 0) + 1;
        return breakdown;
      }, {})
    ).map(([entrySeverity, count]) => ({ severity: entrySeverity, count }));

    await AuditLogger.logSecurityEvent(
      context.user.id,
      'AUDIT_ACCESS',
      'medium',
      `Accessed role audit history for user ${userId}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          targetUserId: userId,
          filters: { action, severity, startDate, endDate, search },
        },
      }
    );

    return NextResponse.json({
      success: true,
      entries,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalEntries: totalCount,
        actionBreakdown,
        severityBreakdown,
        dateRange: {
          earliest: logs.length
            ? logs[logs.length - 1].createdAt.toISOString()
            : null,
          latest: logs.length ? logs[0].createdAt.toISOString() : null,
        },
      },
      targetUser,
      meta: {
        requestedBy: context.user.id,
        requestedAt: new Date().toISOString(),
        filters: {
          action,
          severity,
          dateRange: { startDate, endDate },
          search,
        },
      },
    });
  } catch (error) {
    console.error('Failed to fetch role audit history:', error);

    await AuditLogger.logSecurityEvent(
      'system',
      'AUDIT_FETCH_ERROR',
      'high',
      `Failed to fetch role audit history: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          endpoint: 'audit/user-roles',
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
        },
      }
    );

    return NextResponse.json(
      {
        error: 'Failed to fetch role audit history',
        details:
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.message
              : 'Unknown error'
            : undefined,
      },
      { status: 500 }
    );
  }
}
