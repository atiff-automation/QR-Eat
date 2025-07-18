/**
 * Bulk User Role Operations API
 * 
 * Handles bulk operations on user roles including:
 * - Bulk role assignments
 * - Bulk role removals
 * - Bulk role updates
 * - Bulk role activation/deactivation
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { PermissionManager } from '@/lib/rbac/permissions';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/prisma';
import { SecurityUtils } from '@/lib/security';
import { RBAC_CONSTANTS } from '@/lib/rbac/types';

interface BulkOperationResult {
  userId: string;
  userName: string;
  success: boolean;
  error?: string;
}

// POST /api/admin/users/bulk - Perform bulk operations on user roles
export async function POST(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['users:write', 'users:bulk'],
      auditLog: true,
      rateLimit: { windowMs: 300000, maxRequests: 3 } // Very strict rate limiting for bulk operations
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { 
      operation, 
      userIds, 
      userType, 
      roleTemplate, 
      restaurantId, 
      customPermissions, 
      reason,
      action
    } = await request.json();

    // Handle special get_bulk action for fetching user details
    if (action === 'get_bulk') {
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return NextResponse.json(
          { error: 'User IDs array is required' },
          { status: 400 }
        );
      }

      // Fetch users from all user types
      const [platformAdmins, restaurantOwners, staff] = await Promise.all([
        prisma.platformAdmin.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true
          }
        }),
        prisma.restaurantOwner.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true
          }
        }),
        prisma.staff.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true
          }
        })
      ]);

      const allUsers = [
        ...platformAdmins.map(u => ({ ...u, userType: 'platform_admin' as const })),
        ...restaurantOwners.map(u => ({ ...u, userType: 'restaurant_owner' as const })),
        ...staff.map(u => ({ ...u, userType: 'staff' as const }))
      ];

      return NextResponse.json({
        success: true,
        users: allUsers
      });
    }

    // Validate bulk operation input
    if (!operation || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'Operation type and user IDs array are required' },
        { status: 400 }
      );
    }

    if (userIds.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 users allowed per bulk operation' },
        { status: 400 }
      );
    }

    const validOperations = ['assign', 'remove', 'update', 'activate', 'deactivate'];
    if (!validOperations.includes(operation)) {
      return NextResponse.json(
        { error: `Invalid operation. Valid operations: ${validOperations.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate required fields for assign/update operations
    if ((operation === 'assign' || operation === 'update') && (!userType || !roleTemplate)) {
      return NextResponse.json(
        { error: 'User type and role template are required for assign/update operations' },
        { status: 400 }
      );
    }

    // Validate role template
    if (roleTemplate && !RBAC_CONSTANTS.ROLE_TEMPLATES.includes(roleTemplate)) {
      return NextResponse.json(
        { error: 'Invalid role template' },
        { status: 400 }
      );
    }

    // Validate restaurant requirement
    if ((operation === 'assign' || operation === 'update') && 
        (userType === 'restaurant_owner' || userType === 'staff') && !restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant ID is required for restaurant owners and staff' },
        { status: 400 }
      );
    }

    // Verify restaurant exists if provided
    if (restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, isActive: true }
      });
      
      if (!restaurant) {
        return NextResponse.json(
          { error: 'Restaurant not found' },
          { status: 404 }
        );
      }
      
      if (!restaurant.isActive) {
        return NextResponse.json(
          { error: 'Restaurant is inactive' },
          { status: 400 }
        );
      }
    }

    // Validate custom permissions if provided
    if (customPermissions && customPermissions.length > 0) {
      const validPermissions = await prisma.permission.findMany({
        where: {
          permissionKey: { in: customPermissions },
          isActive: true
        }
      });
      
      if (validPermissions.length !== customPermissions.length) {
        const invalidPermissions = customPermissions.filter(p => 
          !validPermissions.some(vp => vp.permissionKey === p)
        );
        return NextResponse.json(
          { 
            error: 'Some custom permissions are invalid',
            invalidPermissions
          },
          { status: 400 }
        );
      }
    }

    // Fetch user details for processing
    const [platformAdmins, restaurantOwners, staff] = await Promise.all([
      prisma.platformAdmin.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true }
      }),
      prisma.restaurantOwner.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true }
      }),
      prisma.staff.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true }
      })
    ]);

    const allUsers = [
      ...platformAdmins,
      ...restaurantOwners,
      ...staff
    ];

    const userMap = new Map(allUsers.map(user => [
      user.id, 
      `${user.firstName} ${user.lastName}`
    ]));

    // Process bulk operation
    const results: BulkOperationResult[] = [];
    const operationTimestamp = new Date();

    for (const userId of userIds) {
      const userName = userMap.get(userId) || 'Unknown User';
      
      try {
        switch (operation) {
          case 'assign':
            // Check if user already has this role
            const existingRole = await prisma.userRole.findFirst({
              where: {
                userId,
                userType,
                roleTemplate,
                restaurantId: restaurantId || null
              }
            });
            
            if (existingRole) {
              results.push({
                userId,
                userName,
                success: false,
                error: 'User already has this role'
              });
              continue;
            }
            
            // Create new role
            await prisma.userRole.create({
              data: {
                userId,
                userType,
                roleTemplate,
                restaurantId: restaurantId || null,
                customPermissions: customPermissions || [],
                isActive: true
              }
            });
            break;

          case 'remove':
            // Remove all active roles for the user
            await prisma.userRole.updateMany({
              where: { 
                userId,
                isActive: true
              },
              data: { isActive: false }
            });
            break;

          case 'update':
            // Update existing roles
            await prisma.userRole.updateMany({
              where: { 
                userId,
                isActive: true
              },
              data: {
                ...(roleTemplate && { roleTemplate }),
                ...(customPermissions && { customPermissions }),
                updatedAt: operationTimestamp
              }
            });
            break;

          case 'activate':
            await prisma.userRole.updateMany({
              where: { userId },
              data: { isActive: true, updatedAt: operationTimestamp }
            });
            break;

          case 'deactivate':
            await prisma.userRole.updateMany({
              where: { userId },
              data: { isActive: false, updatedAt: operationTimestamp }
            });
            break;
        }

        // Clear user's permission cache
        PermissionManager.clearUserCache(userId);

        // Log individual operation
        await AuditLogger.logUserRoleChange(
          context.user.id,
          userId,
          operation.toUpperCase() as any,
          {
            id: `bulk-${operation}-${userId}`,
            userType: userType || 'unknown',
            roleTemplate: roleTemplate || 'bulk_operation',
            restaurantId: restaurantId || null,
            customPermissions: customPermissions || [],
            isActive: operation === 'activate' || operation === 'assign'
          },
          {
            ipAddress: SecurityUtils.getClientIP(request),
            userAgent: request.headers.get('user-agent') || 'unknown',
            metadata: {
              bulkOperation: true,
              operationType: operation,
              reason: reason || 'Bulk operation',
              totalUsersInBatch: userIds.length
            }
          }
        );

        results.push({
          userId,
          userName,
          success: true
        });

      } catch (error) {
        console.error(`Bulk operation failed for user ${userId}:`, error);
        results.push({
          userId,
          userName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Log bulk operation summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'BULK_ROLE_OPERATION',
      successCount === results.length ? 'medium' : 'high',
      `Bulk ${operation} operation completed: ${successCount}/${results.length} successful`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          operation,
          totalUsers: userIds.length,
          successCount,
          failureCount,
          reason: reason || 'No reason provided',
          roleTemplate,
          userType,
          restaurantId
        }
      }
    );

    return NextResponse.json({
      success: successCount === results.length,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
        operation,
        timestamp: operationTimestamp.toISOString()
      }
    });

  } catch (error) {
    console.error('Bulk operation error:', error);
    
    // Log error for security monitoring
    await AuditLogger.logSecurityEvent(
      'system',
      'BULK_OPERATION_ERROR',
      'high',
      `Bulk operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          endpoint: 'admin/users/bulk',
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      }
    );

    return NextResponse.json(
      { 
        error: 'Bulk operation failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}