/**
 * Admin Permission Management API
 * 
 * This endpoint provides comprehensive permission management for platform administrators.
 * It allows viewing, creating, updating, and managing permissions in the RBAC system.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { PermissionManager } from '@/lib/rbac/permissions';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/prisma';
import { SecurityUtils } from '@/lib/security';

// GET /api/admin/permissions - Get all permissions
export async function GET(request: NextRequest) {
  try {
    // Apply RBAC middleware - only platform admins can access
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['permissions:read'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 100 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    
    // Get query parameters
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const search = url.searchParams.get('search');
    
    // Build query conditions
    const whereClause: any = {};
    
    if (category) {
      whereClause.category = category;
    }
    
    if (!includeInactive) {
      whereClause.isActive = true;
    }
    
    if (search) {
      whereClause.OR = [
        { permissionKey: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Get total count
    const totalCount = await prisma.permission.count({ where: whereClause });
    
    // Get permissions with pagination
    const permissions = await prisma.permission.findMany({
      where: whereClause,
      orderBy: [
        { category: 'asc' },
        { permissionKey: 'asc' }
      ],
      skip: (page - 1) * limit,
      take: limit
    });
    
    // Get permission categories
    const categories = await prisma.permission.groupBy({
      by: ['category'],
      _count: { category: true },
      where: { isActive: true }
    });
    
    // Format response
    const formattedPermissions = permissions.map(permission => ({
      id: permission.id,
      permissionKey: permission.permissionKey,
      description: permission.description,
      category: permission.category,
      isActive: permission.isActive,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt
    }));
    
    return NextResponse.json({
      permissions: formattedPermissions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      categories: categories.map(cat => ({
        name: cat.category,
        count: cat._count.category
      })),
      meta: {
        requestedBy: context.user.id,
        requestedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Permission management API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin/permissions - Create new permission
export async function POST(request: NextRequest) {
  try {
    // Apply RBAC middleware - only platform admins can create permissions
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['permissions:write'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 20 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { permissionKey, description, category } = await request.json();
    
    // Validate input
    if (!permissionKey || !description || !category) {
      return NextResponse.json(
        { error: 'Permission key, description, and category are required' },
        { status: 400 }
      );
    }
    
    // Validate permission key format
    if (!/^[a-z_]+:[a-z_]+$/.test(permissionKey)) {
      return NextResponse.json(
        { error: 'Permission key must be in format "resource:action"' },
        { status: 400 }
      );
    }
    
    // Check if permission already exists
    const existingPermission = await prisma.permission.findUnique({
      where: { permissionKey }
    });
    
    if (existingPermission) {
      return NextResponse.json(
        { error: 'Permission key already exists' },
        { status: 409 }
      );
    }
    
    // Create new permission
    const newPermission = await prisma.permission.create({
      data: {
        permissionKey,
        description,
        category,
        isActive: true
      }
    });
    
    // Log audit trail
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'PERMISSION_CREATED',
      'medium',
      `Created new permission: ${permissionKey}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          permissionId: newPermission.id,
          permissionKey,
          category
        }
      }
    );
    
    return NextResponse.json({
      message: 'Permission created successfully',
      permission: {
        id: newPermission.id,
        permissionKey: newPermission.permissionKey,
        description: newPermission.description,
        category: newPermission.category,
        isActive: newPermission.isActive,
        createdAt: newPermission.createdAt
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Permission creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/permissions - Update permission
export async function PUT(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['permissions:write'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 50 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { id, description, category, isActive } = await request.json();
    
    // Validate input
    if (!id) {
      return NextResponse.json(
        { error: 'Permission ID is required' },
        { status: 400 }
      );
    }
    
    // Get current permission
    const currentPermission = await prisma.permission.findUnique({
      where: { id }
    });
    
    if (!currentPermission) {
      return NextResponse.json(
        { error: 'Permission not found' },
        { status: 404 }
      );
    }
    
    // Update permission
    const updatedPermission = await prisma.permission.update({
      where: { id },
      data: {
        ...(description && { description }),
        ...(category && { category }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      }
    });
    
    // Clear permission cache
    PermissionManager.clearCache();
    
    // Log audit trail
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'PERMISSION_UPDATED',
      'medium',
      `Updated permission: ${currentPermission.permissionKey}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          permissionId: id,
          permissionKey: currentPermission.permissionKey,
          changes: {
            description: description !== currentPermission.description ? { from: currentPermission.description, to: description } : undefined,
            category: category !== currentPermission.category ? { from: currentPermission.category, to: category } : undefined,
            isActive: isActive !== currentPermission.isActive ? { from: currentPermission.isActive, to: isActive } : undefined
          }
        }
      }
    );
    
    return NextResponse.json({
      message: 'Permission updated successfully',
      permission: {
        id: updatedPermission.id,
        permissionKey: updatedPermission.permissionKey,
        description: updatedPermission.description,
        category: updatedPermission.category,
        isActive: updatedPermission.isActive,
        updatedAt: updatedPermission.updatedAt
      }
    });
  } catch (error) {
    console.error('Permission update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/permissions - Delete permission
export async function DELETE(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['permissions:delete'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 10 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { id } = await request.json();
    
    // Validate input
    if (!id) {
      return NextResponse.json(
        { error: 'Permission ID is required' },
        { status: 400 }
      );
    }
    
    // Get current permission
    const currentPermission = await prisma.permission.findUnique({
      where: { id }
    });
    
    if (!currentPermission) {
      return NextResponse.json(
        { error: 'Permission not found' },
        { status: 404 }
      );
    }
    
    // Check if permission is used in role templates
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { permissionKey: currentPermission.permissionKey }
    });
    
    if (rolePermissions.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete permission that is assigned to role templates',
          affectedRoles: rolePermissions.map(rp => rp.roleTemplate)
        },
        { status: 409 }
      );
    }
    
    // Soft delete - mark as inactive instead of hard delete
    const deletedPermission = await prisma.permission.update({
      where: { id },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });
    
    // Clear permission cache
    PermissionManager.clearCache();
    
    // Log audit trail
    await AuditLogger.logSecurityEvent(
      context.user.id,
      'PERMISSION_DELETED',
      'high',
      `Deleted permission: ${currentPermission.permissionKey}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          permissionId: id,
          permissionKey: currentPermission.permissionKey,
          category: currentPermission.category
        }
      }
    );
    
    return NextResponse.json({
      message: 'Permission deleted successfully',
      permission: {
        id: deletedPermission.id,
        permissionKey: deletedPermission.permissionKey,
        isActive: deletedPermission.isActive
      }
    });
  } catch (error) {
    console.error('Permission deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}