/**
 * Role Analytics API
 * 
 * Provides comprehensive analytics for role-based access control including:
 * - Role distribution and trends
 * - Permission usage statistics
 * - User activity metrics
 * - Security insights and recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/database';
import { SecurityUtils } from '@/lib/security';

// GET /api/admin/analytics/roles - Get role analytics
export async function GET(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['analytics:read'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 30 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    
    // Get query parameters
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || '30d';
    const restaurantId = url.searchParams.get('restaurantId');
    const userType = url.searchParams.get('userType');

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
    const userRoleFilter: Record<string, unknown> = {
      createdAt: { gte: startDate }
    };

    if (restaurantId && restaurantId !== 'all') {
      userRoleFilter.restaurantId = restaurantId;
    }

    if (userType && userType !== 'all') {
      userRoleFilter.userType = userType;
    }

    // 1. Overview Statistics
    const [totalUsers, totalRoles, totalPermissions, activeUsers, inactiveUsers] = await Promise.all([
      // Total users across all types
      Promise.all([
        prisma.platformAdmin.count(),
        prisma.restaurantOwner.count(),
        prisma.staff.count()
      ]).then(counts => counts.reduce((sum, count) => sum + count, 0)),
      
      // Total active roles
      prisma.userRole.count({ where: { isActive: true } }),
      
      // Total active permissions
      prisma.permission.count({ where: { isActive: true } }),
      
      // Active users
      Promise.all([
        prisma.platformAdmin.count({ where: { isActive: true } }),
        prisma.restaurantOwner.count({ where: { isActive: true } }),
        prisma.staff.count({ where: { isActive: true } })
      ]).then(counts => counts.reduce((sum, count) => sum + count, 0)),
      
      // Inactive users
      Promise.all([
        prisma.platformAdmin.count({ where: { isActive: false } }),
        prisma.restaurantOwner.count({ where: { isActive: false } }),
        prisma.staff.count({ where: { isActive: false } })
      ]).then(counts => counts.reduce((sum, count) => sum + count, 0))
    ]);

    // 2. Role Distribution
    const roleDistribution = await prisma.userRole.groupBy({
      by: ['roleTemplate'],
      where: { isActive: true },
      _count: true
    });

    // Calculate trends for role distribution
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setTime(previousPeriodStart.getTime() - (now.getTime() - startDate.getTime()));
    
    const previousRoleDistribution = await prisma.userRole.groupBy({
      by: ['roleTemplate'],
      where: {
        isActive: true,
        createdAt: { gte: previousPeriodStart, lt: startDate }
      },
      _count: true
    });

    const roleDistributionWithTrends = roleDistribution.map(role => {
      const currentCount = role._count;
      const previousRole = previousRoleDistribution.find(p => p.roleTemplate === role.roleTemplate);
      const previousCount = previousRole?._count || 0;
      
      const change = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 0;
      const trend = Math.abs(change) < 5 ? 'stable' : (change > 0 ? 'up' : 'down');
      
      return {
        template: role.roleTemplate,
        userCount: currentCount,
        percentage: totalRoles > 0 ? (currentCount / totalRoles) * 100 : 0,
        trend,
        change: Math.round(change * 100) / 100
      };
    });

    // 3. Permission Usage
    const allUserRoles = await prisma.userRole.findMany({
      where: { isActive: true },
      select: {
        roleTemplate: true,
        customPermissions: true
      }
    });

    // Get all role templates and their permissions
    const roleTemplates = await prisma.roleTemplate.findMany({
      where: { isActive: true },
      select: {
        template: true,
        permissions: true
      }
    });

    // Calculate permission usage
    const permissionUsage = new Map<string, { 
      userCount: number, 
      roleCount: number, 
      category: string 
    }>();

    // Process role template permissions
    for (const userRole of allUserRoles) {
      const template = roleTemplates.find(t => t.template === userRole.roleTemplate);
      if (template && template.permissions) {
        const permissions = Array.isArray(template.permissions) ? template.permissions : [];
        for (const permission of permissions) {
          const current = permissionUsage.get(permission) || { userCount: 0, roleCount: 0, category: 'unknown' };
          current.userCount += 1;
          permissionUsage.set(permission, current);
        }
      }

      // Process custom permissions
      if (userRole.customPermissions && Array.isArray(userRole.customPermissions)) {
        for (const permission of userRole.customPermissions) {
          const current = permissionUsage.get(permission) || { userCount: 0, roleCount: 0, category: 'custom' };
          current.userCount += 1;
          permissionUsage.set(permission, current);
        }
      }
    }

    // Get permission details for categories
    const allPermissions = await prisma.permission.findMany({
      where: { isActive: true },
      select: { permissionKey: true, category: true }
    });

    const permissionUsageArray = Array.from(permissionUsage.entries()).map(([permission, data]) => {
      const permissionDetail = allPermissions.find(p => p.permissionKey === permission);
      return {
        permission,
        category: permissionDetail?.category || data.category,
        userCount: data.userCount,
        roleCount: data.roleCount,
        utilizationRate: totalUsers > 0 ? (data.userCount / totalUsers) * 100 : 0
      };
    }).sort((a, b) => b.userCount - a.userCount);

    // 4. User Type Breakdown
    const [platformAdminCount, restaurantOwnerCount, staffCount] = await Promise.all([
      prisma.platformAdmin.count({ where: { isActive: true } }),
      prisma.restaurantOwner.count({ where: { isActive: true } }),
      prisma.staff.count({ where: { isActive: true } })
    ]);

    // Calculate average permissions per user type
    const userTypePermissions = await Promise.all([
      prisma.userRole.findMany({
        where: { userType: 'platform_admin', isActive: true },
        select: { customPermissions: true, roleTemplate: true }
      }),
      prisma.userRole.findMany({
        where: { userType: 'restaurant_owner', isActive: true },
        select: { customPermissions: true, roleTemplate: true }
      }),
      prisma.userRole.findMany({
        where: { userType: 'staff', isActive: true },
        select: { customPermissions: true, roleTemplate: true }
      })
    ]);

    const userTypeBreakdown = [
      {
        userType: 'platform_admin',
        count: platformAdminCount,
        percentage: activeUsers > 0 ? (platformAdminCount / activeUsers) * 100 : 0,
        activeCount: platformAdminCount,
        averagePermissions: userTypePermissions[0].length > 0 ? 
          userTypePermissions[0].reduce((sum, role) => {
            const templatePerms = roleTemplates.find(t => t.template === role.roleTemplate)?.permissions?.length || 0;
            const customPerms = Array.isArray(role.customPermissions) ? role.customPermissions.length : 0;
            return sum + templatePerms + customPerms;
          }, 0) / userTypePermissions[0].length : 0
      },
      {
        userType: 'restaurant_owner',
        count: restaurantOwnerCount,
        percentage: activeUsers > 0 ? (restaurantOwnerCount / activeUsers) * 100 : 0,
        activeCount: restaurantOwnerCount,
        averagePermissions: userTypePermissions[1].length > 0 ? 
          userTypePermissions[1].reduce((sum, role) => {
            const templatePerms = roleTemplates.find(t => t.template === role.roleTemplate)?.permissions?.length || 0;
            const customPerms = Array.isArray(role.customPermissions) ? role.customPermissions.length : 0;
            return sum + templatePerms + customPerms;
          }, 0) / userTypePermissions[1].length : 0
      },
      {
        userType: 'staff',
        count: staffCount,
        percentage: activeUsers > 0 ? (staffCount / activeUsers) * 100 : 0,
        activeCount: staffCount,
        averagePermissions: userTypePermissions[2].length > 0 ? 
          userTypePermissions[2].reduce((sum, role) => {
            const templatePerms = roleTemplates.find(t => t.template === role.roleTemplate)?.permissions?.length || 0;
            const customPerms = Array.isArray(role.customPermissions) ? role.customPermissions.length : 0;
            return sum + templatePerms + customPerms;
          }, 0) / userTypePermissions[2].length : 0
      }
    ];

    // 5. Restaurant Analytics
    const restaurantAnalytics = await prisma.restaurant.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        userRoles: {
          where: { isActive: true },
          select: {
            userId: true,
            roleTemplate: true,
            customPermissions: true,
            updatedAt: true
          }
        }
      },
      take: 10
    });

    const restaurantAnalyticsFormatted = restaurantAnalytics.map(restaurant => ({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      userCount: new Set(restaurant.userRoles.map(role => role.userId)).size,
      roleCount: restaurant.userRoles.length,
      permissionCount: restaurant.userRoles.reduce((sum, role) => {
        const templatePerms = roleTemplates.find(t => t.template === role.roleTemplate)?.permissions?.length || 0;
        const customPerms = Array.isArray(role.customPermissions) ? role.customPermissions.length : 0;
        return sum + templatePerms + customPerms;
      }, 0),
      lastActivity: restaurant.userRoles.length > 0 ? 
        Math.max(...restaurant.userRoles.map(role => new Date(role.updatedAt).getTime())) :
        Date.now()
    })).map(restaurant => ({
      ...restaurant,
      lastActivity: new Date(restaurant.lastActivity).toISOString()
    }));

    // 6. Security Insights
    const securityInsights = [];

    // Check for users with excessive permissions
    const usersWithManyRoles = await prisma.userRole.groupBy({
      by: ['userId'],
      where: { isActive: true },
      _count: true,
      having: { userId: { _count: { gt: 3 } } }
    });

    if (usersWithManyRoles.length > 0) {
      securityInsights.push({
        type: 'warning' as const,
        title: 'Users with Multiple Roles',
        description: 'Some users have been assigned multiple roles which may indicate over-privileging',
        severity: 'medium' as const,
        actionRequired: true,
        count: usersWithManyRoles.length
      });
    }

    // Check for inactive users with active roles
    const inactiveUsersWithRoles = await prisma.userRole.count({
      where: {
        isActive: true,
        OR: [
          { user: { platformAdmin: { isActive: false } } },
          { user: { restaurantOwner: { isActive: false } } },
          { user: { staff: { isActive: false } } }
        ]
      }
    });

    if (inactiveUsersWithRoles > 0) {
      securityInsights.push({
        type: 'error' as const,
        title: 'Inactive Users with Active Roles',
        description: 'Some inactive users still have active role assignments',
        severity: 'high' as const,
        actionRequired: true,
        count: inactiveUsersWithRoles
      });
    }

    // Check role distribution balance
    const roleImbalance = roleDistributionWithTrends.find(role => role.percentage > 70);
    if (roleImbalance) {
      securityInsights.push({
        type: 'info' as const,
        title: 'Role Distribution Imbalance',
        description: `Most users (${roleImbalance.percentage.toFixed(1)}%) are assigned to ${roleImbalance.template} role`,
        severity: 'low' as const,
        actionRequired: false
      });
    }

    // 7. Activity Trends
    const trends = [];
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const intervalDays = Math.max(1, Math.floor(periodDays / 5));

    for (let i = 0; i < 5; i++) {
      const intervalStart = new Date(startDate);
      intervalStart.setDate(startDate.getDate() + (i * intervalDays));
      const intervalEnd = new Date(intervalStart);
      intervalEnd.setDate(intervalStart.getDate() + intervalDays);

      const [newRoles, removedRoles, permissionChanges] = await Promise.all([
        prisma.userRole.count({
          where: {
            createdAt: { gte: intervalStart, lt: intervalEnd },
            isActive: true
          }
        }),
        prisma.auditLog.count({
          where: {
            action: 'DELETE',
            entityType: 'user_role',
            timestamp: { gte: intervalStart, lt: intervalEnd }
          }
        }),
        prisma.auditLog.count({
          where: {
            action: 'UPDATE',
            entityType: 'user_role',
            timestamp: { gte: intervalStart, lt: intervalEnd }
          }
        })
      ]);

      trends.push({
        period: `${intervalStart.toLocaleDateString()} - ${intervalEnd.toLocaleDateString()}`,
        newRoles,
        removedRoles,
        permissionChanges,
        userActivations: 0, // Would need additional tracking
        userDeactivations: 0 // Would need additional tracking
      });
    }

    // Log analytics access
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'ANALYTICS_ACCESS',
      'low',
      'Accessed role analytics dashboard',
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          period,
          restaurantId,
          userType,
          analyticsType: 'roles'
        }
      }
    );

    const analytics = {
      overview: {
        totalUsers,
        totalRoles,
        totalPermissions,
        activeUsers,
        inactiveUsers,
        lastUpdated: new Date().toISOString()
      },
      roleDistribution: roleDistributionWithTrends,
      permissionUsage: permissionUsageArray.slice(0, 20),
      userTypeBreakdown,
      restaurantAnalytics: restaurantAnalyticsFormatted,
      securityInsights,
      trends
    };

    return NextResponse.json({
      success: true,
      analytics,
      meta: {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        filters: {
          restaurantId,
          userType
        },
        generatedAt: new Date().toISOString(),
        generatedBy: context.user.id
      }
    });

  } catch (error) {
    console.error('Failed to fetch role analytics:', error);
    
    // Log error for security monitoring
    await AuditLogger.logSecurityEvent(
      'system',
      'ANALYTICS_ERROR',
      'medium',
      `Failed to fetch role analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          endpoint: 'analytics/roles',
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      }
    );

    return NextResponse.json(
      { 
        error: 'Failed to fetch role analytics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}