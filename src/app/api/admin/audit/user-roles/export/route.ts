/**
 * User Role Audit History Export API
 * 
 * Exports user role audit history in various formats (CSV, JSON, PDF)
 * with comprehensive filtering and security controls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/prisma';
import { SecurityUtils } from '@/lib/security';

// GET /api/admin/audit/user-roles/export - Export user role audit history
export async function GET(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['audit:export'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 5 } // Strict rate limiting for exports
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    
    // Get query parameters
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

    // Verify user exists
    const targetUser = await prisma.platformAdmin.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true }
    }) || await prisma.restaurantOwner.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true }
    }) || await prisma.staff.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Build filter conditions
    const whereConditions: any = {
      entityType: 'user_role',
      entityId: userId
    };

    if (action && action !== 'all') {
      whereConditions.action = action;
    }

    if (severity && severity !== 'all') {
      whereConditions.severity = severity;
    }

    if (startDate || endDate) {
      whereConditions.timestamp = {};
      if (startDate) {
        whereConditions.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        whereConditions.timestamp.lte = new Date(endDate + 'T23:59:59.999Z');
      }
    }

    // Fetch audit entries (no pagination for export)
    const auditEntries = await prisma.auditLog.findMany({
      where: whereConditions,
      include: {
        performedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    // Transform data for export
    const exportData = auditEntries.map(entry => {
      const details = typeof entry.details === 'object' ? entry.details as any : {};
      const metadata = typeof entry.metadata === 'object' ? entry.metadata as any : {};

      return {
        timestamp: entry.timestamp.toISOString(),
        action: entry.action,
        severity: entry.severity,
        performedBy: entry.performedBy ? `${entry.performedBy.firstName} ${entry.performedBy.lastName}` : 'System',
        performedByEmail: entry.performedBy?.email || 'system@system.local',
        roleTemplate: details.roleTemplate || '',
        userType: details.userType || '',
        restaurantName: details.restaurant?.name || '',
        restaurantId: details.restaurantId || '',
        customPermissionsCount: details.customPermissions?.length || 0,
        reason: details.reason || '',
        changes: details.changes ? JSON.stringify(details.changes) : '',
        ipAddress: metadata.ipAddress || 'unknown',
        userAgent: metadata.userAgent || 'unknown',
        source: metadata.source || 'admin_panel',
        description: entry.description
      };
    });

    // Log export action
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
          filters: {
            action,
            severity,
            startDate,
            endDate
          }
        }
      }
    );

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `role-audit-${targetUser.firstName}-${targetUser.lastName}-${timestamp}.${format}`;

    if (format === 'csv') {
      // Generate CSV
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
        'Description'
      ];

      const csvRows = [
        headers.join(','),
        ...exportData.map(row => [
          `"${row.timestamp}"`,
          `"${row.action}"`,
          `"${row.severity}"`,
          `"${row.performedBy}"`,
          `"${row.performedByEmail}"`,
          `"${row.roleTemplate}"`,
          `"${row.userType}"`,
          `"${row.restaurantName}"`,
          `"${row.restaurantId}"`,
          `"${row.customPermissionsCount}"`,
          `"${row.reason}"`,
          `"${row.changes.replace(/"/g, '""')}"`,
          `"${row.ipAddress}"`,
          `"${row.userAgent.replace(/"/g, '""')}"`,
          `"${row.source}"`,
          `"${row.description.replace(/"/g, '""')}"`
        ].join(','))
      ];

      const csvContent = csvRows.join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

    } else if (format === 'json') {
      // Generate JSON
      const jsonData = {
        exportMetadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: {
            id: context.user.id,
            email: context.user.email,
            name: `${context.user.firstName} ${context.user.lastName}`
          },
          targetUser: {
            id: targetUser.id,
            email: targetUser.email,
            name: `${targetUser.firstName} ${targetUser.lastName}`
          },
          filters: {
            action,
            severity,
            dateRange: { startDate, endDate }
          },
          recordCount: exportData.length
        },
        auditEntries: exportData
      };

      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    return NextResponse.json(
      { error: 'Unsupported format' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Failed to export role audit history:', error);
    
    // Log error for security monitoring
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
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      }
    );

    return NextResponse.json(
      { 
        error: 'Failed to export role audit history',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}