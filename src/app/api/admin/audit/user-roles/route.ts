/**
 * User Role Audit History API
 * 
 * Provides comprehensive audit trail for user role changes including:
 * - Role assignments and removals
 * - Permission modifications
 * - Status changes
 * - Administrative actions
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/prisma';
import { SecurityUtils } from '@/lib/security';

// GET /api/admin/audit/user-roles - Get user role audit history
export async function GET(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['audit:read'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 50 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    
    // Get query parameters
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

    // Fetch audit entries
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
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    // Get total count for pagination
    const totalCount = await prisma.auditLog.count({
      where: whereConditions
    });

    // Transform audit entries to role history format
    const roleHistory = auditEntries.map(entry => {
      const details = typeof entry.details === 'object' ? entry.details as any : {};
      const metadata = typeof entry.metadata === 'object' ? entry.metadata as any : {};

      return {
        id: entry.id,
        userId: entry.entityId,
        action: entry.action,
        actionType: entry.category || 'role_assignment',
        performedBy: entry.performedBy || {
          id: 'system',
          email: 'system@system.local',
          firstName: 'System',
          lastName: 'Admin'
        },
        timestamp: entry.timestamp,
        details: {
          roleTemplate: details.roleTemplate,
          userType: details.userType,
          restaurantId: details.restaurantId,
          restaurant: details.restaurant,
          changes: details.changes,
          customPermissions: details.customPermissions,
          reason: details.reason
        },
        metadata: {
          ipAddress: metadata.ipAddress || 'unknown',
          userAgent: metadata.userAgent || 'unknown',
          sessionId: metadata.sessionId,
          source: metadata.source || 'admin_panel'
        },
        severity: entry.severity
      };
    });

    // Apply search filter if provided
    let filteredHistory = roleHistory;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredHistory = roleHistory.filter(entry => 
        entry.performedBy.email.toLowerCase().includes(searchLower) ||
        entry.performedBy.firstName.toLowerCase().includes(searchLower) ||
        entry.performedBy.lastName.toLowerCase().includes(searchLower) ||
        entry.details.roleTemplate?.toLowerCase().includes(searchLower) ||
        entry.details.restaurant?.name.toLowerCase().includes(searchLower) ||
        entry.action.toLowerCase().includes(searchLower)
      );
    }

    // Get summary statistics
    const summary = {
      totalEntries: totalCount,
      actionBreakdown: await prisma.auditLog.groupBy({
        by: ['action'],
        where: { entityType: 'user_role', entityId: userId },
        _count: true
      }),
      severityBreakdown: await prisma.auditLog.groupBy({
        by: ['severity'],
        where: { entityType: 'user_role', entityId: userId },
        _count: true
      }),
      dateRange: {
        earliest: await prisma.auditLog.findFirst({
          where: { entityType: 'user_role', entityId: userId },
          orderBy: { timestamp: 'asc' },
          select: { timestamp: true }
        }),
        latest: await prisma.auditLog.findFirst({
          where: { entityType: 'user_role', entityId: userId },
          orderBy: { timestamp: 'desc' },
          select: { timestamp: true }
        })
      }
    };

    // Log audit access
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
          filters: {
            action,
            severity,
            startDate,
            endDate,
            search
          }
        }
      }
    );

    return NextResponse.json({
      success: true,
      entries: filteredHistory,
      pagination: {
        page,
        limit,
        totalCount: filteredHistory.length,
        totalPages: Math.ceil(filteredHistory.length / limit)
      },
      summary,
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName
      },
      meta: {
        requestedBy: context.user.id,
        requestedAt: new Date().toISOString(),
        filters: {
          action,
          severity,
          dateRange: { startDate, endDate },
          search
        }
      }
    });

  } catch (error) {
    console.error('Failed to fetch role audit history:', error);
    
    // Log error for security monitoring
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
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      }
    );

    return NextResponse.json(
      { 
        error: 'Failed to fetch role audit history',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}