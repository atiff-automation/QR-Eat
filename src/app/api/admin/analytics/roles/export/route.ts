/**
 * Role Analytics Export API
 * 
 * Exports role analytics data in various formats (CSV, JSON)
 * with comprehensive security controls and audit logging.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/database';
import { SecurityUtils } from '@/lib/security';

// GET /api/admin/analytics/roles/export - Export role analytics
export async function GET(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['analytics:export'],
      auditLog: true,
      rateLimit: { windowMs: 300000, maxRequests: 3 } // Very strict rate limiting for exports
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    
    // Get query parameters
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'csv';
    const period = url.searchParams.get('period') || '30d';
    const restaurantId = url.searchParams.get('restaurantId');
    const userType = url.searchParams.get('userType');

    if (!['csv', 'json'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Supported formats: csv, json' },
        { status: 400 }
      );
    }

    // Calculate date range based on period
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Build filter conditions
    const userRoleFilter: any = {
      createdAt: { gte: startDate }
    };

    if (restaurantId && restaurantId !== 'all') {
      userRoleFilter.restaurantId = restaurantId;
    }

    if (userType && userType !== 'all') {
      userRoleFilter.userType = userType;
    }

    // Fetch comprehensive analytics data for export
    const [
      userRoles,
      roleTemplates,
      allPermissions,
      restaurants,
      platformAdmins,
      restaurantOwners,
      staff,
      auditLogs
    ] = await Promise.all([
      prisma.userRole.findMany({
        where: userRoleFilter,
        include: {
          restaurant: {
            select: { id: true, name: true, slug: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.roleTemplate.findMany({
        where: { isActive: true },
        select: { template: true, permissions: true }
      }),
      prisma.permission.findMany({
        where: { isActive: true },
        select: { permissionKey: true, category: true, description: true }
      }),
      prisma.restaurant.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true }
      }),
      prisma.platformAdmin.findMany({
        select: { id: true, email: true, firstName: true, lastName: true, isActive: true, createdAt: true }
      }),
      prisma.restaurantOwner.findMany({
        select: { id: true, email: true, firstName: true, lastName: true, isActive: true, createdAt: true }
      }),
      prisma.staff.findMany({
        select: { id: true, email: true, firstName: true, lastName: true, isActive: true, createdAt: true }
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: 'user_role',
          timestamp: { gte: startDate }
        },
        select: {
          id: true,
          action: true,
          entityId: true,
          timestamp: true,
          severity: true,
          description: true
        },
        orderBy: { timestamp: 'desc' },
        take: 1000 // Limit to prevent huge exports
      })
    ]);

    // Combine all users
    const allUsers = [
      ...platformAdmins.map(u => ({ ...u, userType: 'platform_admin' })),
      ...restaurantOwners.map(u => ({ ...u, userType: 'restaurant_owner' })),
      ...staff.map(u => ({ ...u, userType: 'staff' }))
    ];

    const userMap = new Map(allUsers.map(user => [user.id, user]));

    // Generate comprehensive export data
    const exportData = userRoles.map(role => {
      const user = userMap.get(role.userId);
      const template = roleTemplates.find(t => t.template === role.roleTemplate);
      const templatePermissions = template?.permissions || [];
      const customPermissions = Array.isArray(role.customPermissions) ? role.customPermissions : [];
      const allRolePermissions = [...templatePermissions, ...customPermissions];

      return {
        // Role Information
        roleId: role.id,
        userId: role.userId,
        userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown User',
        userEmail: user?.email || 'Unknown',
        userType: role.userType,
        userStatus: user?.isActive ? 'Active' : 'Inactive',
        userCreatedAt: user?.createdAt?.toISOString() || '',
        
        // Role Details
        roleTemplate: role.roleTemplate,
        roleActive: role.isActive,
        roleCreatedAt: role.createdAt.toISOString(),
        roleUpdatedAt: role.updatedAt.toISOString(),
        
        // Restaurant Context
        restaurantId: role.restaurantId || '',
        restaurantName: role.restaurant?.name || '',
        restaurantSlug: role.restaurant?.slug || '',
        
        // Permissions
        templatePermissionCount: templatePermissions.length,
        customPermissionCount: customPermissions.length,
        totalPermissionCount: allRolePermissions.length,
        templatePermissions: templatePermissions.join(';'),
        customPermissions: customPermissions.join(';'),
        allPermissions: allRolePermissions.join(';'),
        
        // Permission Categories
        permissionCategories: allRolePermissions
          .map(perm => allPermissions.find(p => p.permissionKey === perm)?.category)
          .filter(Boolean)
          .filter((cat, index, arr) => arr.indexOf(cat) === index)
          .join(';'),
          
        // Calculated Fields
        hasCustomPermissions: customPermissions.length > 0,
        isRestaurantScoped: !!role.restaurantId,
        effectivePermissions: allRolePermissions.length
      };
    });

    // Add summary statistics
    const summary = {
      totalRoles: exportData.length,
      activeRoles: exportData.filter(r => r.roleActive).length,
      inactiveRoles: exportData.filter(r => !r.roleActive).length,
      uniqueUsers: new Set(exportData.map(r => r.userId)).size,
      roleTemplates: new Set(exportData.map(r => r.roleTemplate)).size,
      restaurants: new Set(exportData.map(r => r.restaurantId)).filter(Boolean).size,
      averagePermissions: exportData.length > 0 ? 
        exportData.reduce((sum, r) => sum + r.totalPermissionCount, 0) / exportData.length : 0,
      exportedAt: new Date().toISOString(),
      exportedBy: `${context.user.firstName} ${context.user.lastName}`,
      period,
      filters: { restaurantId, userType }
    };

    // Log export action
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'ANALYTICS_EXPORT',
      'high',
      `Exported role analytics in ${format.toUpperCase()} format`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          format,
          period,
          recordCount: exportData.length,
          filters: { restaurantId, userType },
          summary
        }
      }
    );

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `role-analytics-${period}-${timestamp}.${format}`;

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'Role ID',
        'User ID',
        'User Name',
        'User Email',
        'User Type',
        'User Status',
        'User Created At',
        'Role Template',
        'Role Active',
        'Role Created At',
        'Role Updated At',
        'Restaurant ID',
        'Restaurant Name',
        'Restaurant Slug',
        'Template Permission Count',
        'Custom Permission Count',
        'Total Permission Count',
        'Template Permissions',
        'Custom Permissions',
        'All Permissions',
        'Permission Categories',
        'Has Custom Permissions',
        'Is Restaurant Scoped',
        'Effective Permissions'
      ];

      const csvRows = [
        // Headers
        headers.join(','),
        
        // Summary row
        `"=== SUMMARY (${summary.totalRoles} total roles) ===",${"".repeat(headers.length - 1)},`,
        
        // Data rows
        ...exportData.map(row => [
          `"${row.roleId}"`,
          `"${row.userId}"`,
          `"${row.userName}"`,
          `"${row.userEmail}"`,
          `"${row.userType}"`,
          `"${row.userStatus}"`,
          `"${row.userCreatedAt}"`,
          `"${row.roleTemplate}"`,
          `"${row.roleActive}"`,
          `"${row.roleCreatedAt}"`,
          `"${row.roleUpdatedAt}"`,
          `"${row.restaurantId}"`,
          `"${row.restaurantName}"`,
          `"${row.restaurantSlug}"`,
          `"${row.templatePermissionCount}"`,
          `"${row.customPermissionCount}"`,
          `"${row.totalPermissionCount}"`,
          `"${row.templatePermissions.replace(/"/g, '""')}"`,
          `"${row.customPermissions.replace(/"/g, '""')}"`,
          `"${row.allPermissions.replace(/"/g, '""')}"`,
          `"${row.permissionCategories.replace(/"/g, '""')}"`,
          `"${row.hasCustomPermissions}"`,
          `"${row.isRestaurantScoped}"`,
          `"${row.effectivePermissions}"`
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
          exportedAt: summary.exportedAt,
          exportedBy: summary.exportedBy,
          period,
          filters: summary.filters,
          summary
        },
        roleAnalytics: exportData,
        referenceData: {
          roleTemplates: roleTemplates.map(rt => ({
            template: rt.template,
            permissions: rt.permissions,
            permissionCount: Array.isArray(rt.permissions) ? rt.permissions.length : 0
          })),
          permissions: allPermissions,
          restaurants: restaurants,
          userTypes: ['platform_admin', 'restaurant_owner', 'staff']
        },
        auditTrail: auditLogs.slice(0, 100) // Include recent audit logs
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
    console.error('Failed to export role analytics:', error);
    
    // Log error for security monitoring
    await AuditLogger.logSecurityEvent(
      'system',
      'ANALYTICS_EXPORT_ERROR',
      'high',
      `Failed to export role analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          endpoint: 'analytics/roles/export',
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      }
    );

    return NextResponse.json(
      { 
        error: 'Failed to export role analytics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}