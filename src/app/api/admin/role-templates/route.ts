/**
 * Admin Role Template Management API
 * 
 * This endpoint provides comprehensive role template management for platform administrators.
 * It allows viewing, updating, and managing role templates and their associated permissions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { PermissionManager } from '@/lib/rbac/permissions';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/prisma';
import { SecurityUtils } from '@/lib/security';
import { RBAC_CONSTANTS } from '@/lib/rbac/types';

// GET /api/admin/role-templates - Get all role templates with permissions
export async function GET(request: NextRequest) {
  try {
    // Apply RBAC middleware - only platform admins can access
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['role_templates:read'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 100 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    
    // Get query parameters
    const url = new URL(request.url);
    const template = url.searchParams.get('template');
    const includeStats = url.searchParams.get('includeStats') === 'true';
    
    // Get all role templates with their permissions
    const roleTemplates = await prisma.rolePermission.findMany({
      where: template ? { roleTemplate: template } : {},
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
    
    // Group by role template
    const templatesMap = new Map<string, any>();
    
    roleTemplates.forEach(rp => {
      if (!templatesMap.has(rp.roleTemplate)) {
        templatesMap.set(rp.roleTemplate, {
          template: rp.roleTemplate,
          permissions: [],
          permissionCount: 0,
          categories: new Set()
        });
      }
      
      if (rp.permission.isActive) {
        const templateData = templatesMap.get(rp.roleTemplate);
        templateData.permissions.push(rp.permission);
        templateData.permissionCount++;
        templateData.categories.add(rp.permission.category);
      }
    });
    
    // Convert to array and add metadata
    const formattedTemplates = Array.from(templatesMap.values()).map(template => ({
      ...template,
      categories: Array.from(template.categories),
      description: RBAC_CONSTANTS.ROLE_DESCRIPTIONS[template.template] || 'Custom role template'
    }));
    
    // Add usage statistics if requested
    if (includeStats) {
      for (const template of formattedTemplates) {
        const userCount = await prisma.userRole.count({
          where: { 
            roleTemplate: template.template,
            isActive: true
          }
        });
        
        template.usage = {
          userCount,
          lastUsed: await prisma.userRole.findFirst({
            where: { roleTemplate: template.template },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
          })?.updatedAt || null
        };
      }
    }
    
    return NextResponse.json({
      templates: formattedTemplates,
      availableTemplates: RBAC_CONSTANTS.ROLE_TEMPLATES,
      meta: {
        requestedBy: context.user.id,
        requestedAt: new Date().toISOString(),
        totalTemplates: formattedTemplates.length
      }
    });
  } catch (error) {
    console.error('Role template management API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/role-templates - Update role template permissions
export async function PUT(request: NextRequest) {
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
    const { template, permissions, action = 'replace' } = await request.json();
    
    // Validate input
    if (!template || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'Template name and permissions array are required' },
        { status: 400 }
      );
    }
    
    // Validate template exists
    if (!RBAC_CONSTANTS.ROLE_TEMPLATES.includes(template)) {
      return NextResponse.json(
        { error: 'Invalid role template' },
        { status: 400 }
      );
    }
    
    // Get current permissions for this template
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
    
    // Update permissions based on action
    let permissionsToAdd: string[] = [];
    let permissionsToRemove: string[] = [];
    
    if (action === 'replace') {
      // Replace all permissions
      permissionsToAdd = permissions.filter(p => !currentPermissions.includes(p));
      permissionsToRemove = currentPermissions.filter(p => !permissions.includes(p));
    } else if (action === 'add') {
      // Add new permissions
      permissionsToAdd = permissions.filter(p => !currentPermissions.includes(p));
    } else if (action === 'remove') {
      // Remove permissions
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
    
    // Clear permission cache
    PermissionManager.clearTemplateCache(template);
    
    // Clear cache for all users with this role template
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
    
    // Get updated template data
    const updatedRolePermissions = await prisma.rolePermission.findMany({
      where: { roleTemplate: template },
      include: {
        permission: {
          select: {
            permissionKey: true,
            description: true,
            category: true
          }
        }
      }
    });
    
    return NextResponse.json({
      message: 'Role template updated successfully',
      template: {
        name: template,
        permissions: updatedRolePermissions.map(rp => rp.permission),
        permissionCount: updatedRolePermissions.length,
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

// POST /api/admin/role-templates - Create new role template
export async function POST(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['role_templates:write'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 10 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { template, permissions, description } = await request.json();
    
    // Validate input
    if (!template || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'Template name and permissions array are required' },
        { status: 400 }
      );
    }
    
    // Validate template name format
    if (!/^[a-z_]+$/.test(template)) {
      return NextResponse.json(
        { error: 'Template name must contain only lowercase letters and underscores' },
        { status: 400 }
      );
    }
    
    // Check if template already exists
    const existingTemplate = await prisma.rolePermission.findFirst({
      where: { roleTemplate: template }
    });
    
    if (existingTemplate) {
      return NextResponse.json(
        { error: 'Role template already exists' },
        { status: 409 }
      );
    }
    
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
    
    // Create role template permissions
    await prisma.rolePermission.createMany({
      data: permissions.map(permissionKey => ({
        roleTemplate: template,
        permissionKey,
        grantedAt: new Date()
      }))
    });
    
    // Log audit trail
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'ROLE_TEMPLATE_CREATED',
      'high',
      `Created new role template: ${template}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          template,
          permissions,
          description,
          permissionCount: permissions.length
        }
      }
    );
    
    return NextResponse.json({
      message: 'Role template created successfully',
      template: {
        name: template,
        permissions: validPermissions.map(p => ({
          permissionKey: p.permissionKey,
          description: p.description,
          category: p.category
        })),
        permissionCount: permissions.length,
        description
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Role template creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}