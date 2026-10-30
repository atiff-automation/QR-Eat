/**
 * User Role Audit History Export API
 *
 * Exports role-change events from the canonical RBAC log.
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

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

// GET /api/admin/audit/user-roles/export - Export user role audit history
export async function GET(request: NextRequest) {
  try {
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['users:read'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 5 },
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
    const format = url.searchParams.get('format') || 'csv';
    const action = url.searchParams.get('action');
    const severity = url.searchParams.get('severity');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!['csv', 'json'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Supported formats: csv, json' },
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

    const logs = await prisma.rBACLog.findMany({
      where: buildWhere(userId, action, startDate, endDate),
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

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

    let exportData = logs.map((log) => {
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
        timestamp: log.createdAt.toISOString(),
        action: role,
        severity: actionSeverity(role),
        performedBy: `${performedBy.firstName} ${performedBy.lastName}`,
        performedByEmail: performedBy.email,
        roleTemplate: stringValue(roleDetails.roleTemplate) || '',
        userType: stringValue(roleDetails.userType) || '',
        restaurantName: stringValue(restaurant?.name) || '',
        restaurantId: stringValue(roleDetails.restaurantId) || '',
        customPermissionsCount:
          stringArray(roleDetails.customPermissions)?.length || 0,
        reason: stringValue(metadata.reason) || '',
        changes: changes ? JSON.stringify(changes) : '',
        ipAddress: log.ipAddress || 'unknown',
        userAgent: log.userAgent || 'unknown',
        source: 'admin_panel',
        description: log.resource || '',
      };
    });

    if (severity && severity !== 'all') {
      exportData = exportData.filter((row) => row.severity === severity);
    }

    await AuditLogger.logSecurityEvent(
      context.user.id,
      'AUDIT_EXPORT',
      'high',
      `Exported role audit history for user ${userId} in ${format.toUpperCase()} format`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          targetUserId: userId,
          format,
          recordCount: exportData.length,
          filters: { action, severity, startDate, endDate },
        },
      }
    );

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `role-audit-${targetUser.firstName}-${targetUser.lastName}-${timestamp}.${format}`;

    if (format === 'csv') {
      const headers = [
        'Timestamp',
        'Action',
        'Severity',
        'Performed By',
        'Performed By Email',
        'Role Template',
        'User Type',
        'Restaurant Name',
        'Restaurant ID',
        'Custom Permissions Count',
        'Reason',
        'Changes',
        'IP Address',
        'User Agent',
        'Source',
        'Description',
      ];

      const csvContent = [
        headers.join(','),
        ...exportData.map((row) =>
          [
            row.timestamp,
            row.action,
            row.severity,
            row.performedBy,
            row.performedByEmail,
            row.roleTemplate,
            row.userType,
            row.restaurantName,
            row.restaurantId,
            row.customPermissionsCount,
            row.reason,
            row.changes,
            row.ipAddress,
            row.userAgent,
            row.source,
            row.description,
          ]
            .map(csvCell)
            .join(',')
        ),
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    }

    const jsonData = {
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: {
          id: context.user.id,
          email: context.user.email,
          name: `${context.user.firstName} ${context.user.lastName}`,
        },
        targetUser: {
          id: targetUser.id,
          email: targetUser.email,
          name: `${targetUser.firstName} ${targetUser.lastName}`,
        },
        filters: { action, severity, dateRange: { startDate, endDate } },
        recordCount: exportData.length,
      },
      auditEntries: exportData,
    };

    return new NextResponse(JSON.stringify(jsonData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Failed to export role audit history:', error);

    await AuditLogger.logSecurityEvent(
      'system',
      'AUDIT_EXPORT_ERROR',
      'high',
      `Failed to export role audit history: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          endpoint: 'audit/user-roles/export',
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
        },
      }
    );

    return NextResponse.json(
      {
        error: 'Failed to export role audit history',
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
