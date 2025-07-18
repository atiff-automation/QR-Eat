/**
 * Individual Role Template Management API
 * 
 * This endpoint provides management for individual role templates,
 * allowing detailed view, update, and deletion of specific templates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { PermissionManager } from '@/lib/rbac/permissions';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/prisma';
import { SecurityUtils } from '@/lib/security';
import { RBAC_CONSTANTS } from '@/lib/rbac/types';

// GET /api/admin/role-templates/[template] - Get specific role template
export async function GET(
  request: NextRequest,
  { params }: { params: { template: string } }
) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['role_templates:read'],
      auditLog: false,
      rateLimit: { windowMs: 60000, maxRequests: 200 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { template } = params;
    
    // Get template permissions
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleTemplate: template },
      include: {
        permission: {
          select: {
            id: true,
            permissionKey: true,
            description: true,
            category: true,
            isActive: true
          }
        }
      }
    });
    
    if (rolePermissions.length === 0) {
      return NextResponse.json(
        { error: 'Role template not found' },
        { status: 404 }
      );
    }
    
    // Get usage statistics
    const userCount = await prisma.userRole.count({
      where: { 
        roleTemplate: template,
        isActive: true
      }
    });
    
    // Get recent users with this template
    const recentUsers = await prisma.userRole.findMany({
      where: { 
        roleTemplate: template,
        isActive: true
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });
    
    // Get permission categories
    const categories = [...new Set(rolePermissions.map(rp => rp.permission.category))];
    
    // Format permissions by category
    const permissionsByCategory = categories.reduce((acc, category) => {
      acc[category] = rolePermissions
        .filter(rp => rp.permission.category === category && rp.permission.isActive)
        .map(rp => rp.permission);
      return acc;
    }, {} as Record<string, any[]>);
    
    // Get template metadata
    const templateInfo = {
      name: template,
      description: RBAC_CONSTANTS.ROLE_DESCRIPTIONS[template] || 'Custom role template',
      isBuiltIn: RBAC_CONSTANTS.ROLE_TEMPLATES.includes(template),
      permissions: rolePermissions
        .filter(rp => rp.permission.isActive)
        .map(rp => rp.permission),
      permissionsByCategory,
      categories,
      usage: {
        userCount,
        recentUsers: recentUsers.map(user => ({
          userId: user.userId,
          restaurantId: user.restaurantId,
          restaurantName: user.restaurant?.name,
          assignedAt: user.createdAt,
          lastActivity: user.updatedAt
        }))
      },
      statistics: {
        totalPermissions: rolePermissions.filter(rp => rp.permission.isActive).length,
        categoriesCount: categories.length,
        activeUsers: userCount
      }
    };
    
    return NextResponse.json({
      template: templateInfo,
      meta: {
        requestedBy: context.user.id,
        requestedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Role template detail API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/role-templates/[template] - Update specific role template
export async function PUT(
  request: NextRequest,
  { params }: { params: { template: string } }
) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['role_templates:write'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 50 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { template } = params;
    const { permissions, action = 'replace' } = await request.json();
    
    // Validate input
    if (!Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'Permissions array is required' },
        { status: 400 }
      );
    }
    
    // Check if template exists
    const existingTemplate = await prisma.rolePermission.findFirst({
      where: { roleTemplate: template }
    });
    
    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Role template not found' },
        { status: 404 }
      );
    }
    
    // Get current permissions
    const currentRolePermissions = await prisma.rolePermission.findMany({
      where: { roleTemplate: template },
      include: { permission: true }
    });
    
    const currentPermissions = currentRolePermissions.map(rp => rp.permission.permissionKey);
    
    // Validate all permissions exist
    const validPermissions = await prisma.permission.findMany({
      where: { 
        permissionKey: { in: permissions },
        isActive: true
      }
    });
    
    if (validPermissions.length !== permissions.length) {
      const invalidPermissions = permissions.filter(p => 
        !validPermissions.some(vp => vp.permissionKey === p)
      );
      return NextResponse.json(
        { 
          error: 'Some permissions do not exist or are inactive',
          invalidPermissions
        },
        { status: 400 }
      );
    }
    
    // Calculate changes
    let permissionsToAdd: string[] = [];
    let permissionsToRemove: string[] = [];
    
    if (action === 'replace') {
      permissionsToAdd = permissions.filter(p => !currentPermissions.includes(p));
      permissionsToRemove = currentPermissions.filter(p => !permissions.includes(p));
    } else if (action === 'add') {
      permissionsToAdd = permissions.filter(p => !currentPermissions.includes(p));
    } else if (action === 'remove') {
      permissionsToRemove = permissions.filter(p => currentPermissions.includes(p));
    }
    
    // Perform database operations in transaction
    await prisma.$transaction(async (tx) => {
      // Remove permissions
      if (permissionsToRemove.length > 0) {
        await tx.rolePermission.deleteMany({
          where: {
            roleTemplate: template,
            permissionKey: { in: permissionsToRemove }
          }
        });
      }
      
      // Add permissions
      if (permissionsToAdd.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionsToAdd.map(permissionKey => ({
            roleTemplate: template,
            permissionKey,
            grantedAt: new Date()
          }))
        });
      }
    });
    
    // Clear caches
    PermissionManager.clearTemplateCache(template);
    
    // Clear cache for all users with this template
    const usersWithTemplate = await prisma.userRole.findMany({
      where: { roleTemplate: template, isActive: true },
      select: { userId: true }
    });
    
    usersWithTemplate.forEach(user => {
      PermissionManager.clearUserCache(user.userId);
    });
    
    // Log audit trail
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'ROLE_TEMPLATE_UPDATED',
      'high',
      `Updated role template: ${template}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          template,
          action,
          permissionsAdded: permissionsToAdd,
          permissionsRemoved: permissionsToRemove,
          affectedUsers: usersWithTemplate.length
        }
      }
    );
    
    return NextResponse.json({
      message: 'Role template updated successfully',
      template: {
        name: template,
        affectedUsers: usersWithTemplate.length
      },
      changes: {
        added: permissionsToAdd,
        removed: permissionsToRemove
      }
    });
  } catch (error) {
    console.error('Role template update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/role-templates/[template] - Delete role template
export async function DELETE(
  request: NextRequest,
  { params }: { params: { template: string } }
) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['role_templates:delete'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 10 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { template } = params;
    
    // Check if template exists
    const existingTemplate = await prisma.rolePermission.findFirst({
      where: { roleTemplate: template }
    });
    
    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Role template not found' },
        { status: 404 }
      );
    }
    
    // Check if it's a built-in template
    if (RBAC_CONSTANTS.ROLE_TEMPLATES.includes(template)) {
      return NextResponse.json(
        { error: 'Cannot delete built-in role templates' },
        { status: 403 }
      );
    }
    
    // Check if template is in use
    const usersWithTemplate = await prisma.userRole.findMany({
      where: { roleTemplate: template, isActive: true }
    });
    
    if (usersWithTemplate.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete role template that is assigned to users',
          assignedUsers: usersWithTemplate.length
        },
        { status: 409 }
      );
    }
    
    // Delete all permissions for this template
    await prisma.rolePermission.deleteMany({
      where: { roleTemplate: template }
    });
    
    // Clear caches
    PermissionManager.clearTemplateCache(template);
    
    // Log audit trail
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'ROLE_TEMPLATE_DELETED',
      'critical',
      `Deleted role template: ${template}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          template,
          deletedAt: new Date().toISOString()
        }
      }
    );
    
    return NextResponse.json({
      message: 'Role template deleted successfully',
      template: {
        name: template,
        deletedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Role template deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}