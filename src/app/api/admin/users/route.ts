/**
 * Enhanced Admin User Role Management API
 * 
 * This endpoint provides comprehensive user role management with RBAC integration
 * while maintaining backward compatibility with existing admin functionality.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import { PermissionManager } from '@/lib/rbac/permissions';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { prisma } from '@/lib/database';
import { SecurityUtils } from '@/lib/security';
import { RBAC_CONSTANTS } from '@/lib/rbac/types';
import { verifyAuthToken, UserType } from '@/lib/auth';

// GET /api/admin/users - Get all users with their roles (Enhanced with RBAC)
export async function GET(request: NextRequest) {
  try {
    // Try RBAC middleware first
    const rbacResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['users:read'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 100 }
    });

    let context;
    if (rbacResult.isAuthorized) {
      context = rbacResult.context;
    } else {
      // Fallback to legacy authentication for backward compatibility
      const authResult = await verifyAuthToken(request);
      if (!authResult.isValid || !authResult.user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      // Only platform admins can view all users
      if (authResult.user.type !== UserType.PLATFORM_ADMIN) {
        return NextResponse.json(
          { error: 'Only platform administrators can view all users' },
          { status: 403 }
        );
      }

      // Create context for legacy mode
      context = {
        user: {
          id: authResult.user.user.id,
          email: authResult.user.user.email,
          firstName: authResult.user.user.firstName,
          lastName: authResult.user.user.lastName,
          userType: 'platform_admin',
          isActive: true
        }
      };
    }
    
    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search');
    const userType = url.searchParams.get('userType');
    const includeRoles = url.searchParams.get('includeRoles') === 'true';
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    
    // Fetch all platform admins
    const platformAdmins = await prisma.platformAdmin.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch all restaurant owners with their restaurants
    const restaurantOwners = await prisma.restaurantOwner.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        companyName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        restaurants: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch all staff with their restaurants
    const staff = await prisma.staff.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        username: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        restaurantId: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Combine all users with their types
    const allUsers = [
      ...platformAdmins.map(admin => ({
        ...admin,
        userType: 'platform_admin' as const
      })),
      ...restaurantOwners.map(owner => ({
        ...owner,
        userType: 'restaurant_owner' as const
      })),
      ...staff.map(staffMember => ({
        ...staffMember,
        userType: 'staff' as const
      }))
    ];

    // Add RBAC role information if requested
    if (includeRoles) {
      for (const user of allUsers) {
        const userRoles = await prisma.userRole.findMany({
          where: { 
            userId: user.id,
            ...(includeInactive ? {} : { isActive: true })
          },
          include: {
            restaurant: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        });

        // Get user permissions
        const permissions = await PermissionManager.getUserPermissions(user.id);

        user.rbacData = {
          roles: userRoles.map(role => ({
            id: role.id,
            roleTemplate: role.roleTemplate,
            userType: role.userType,
            restaurantId: role.restaurantId,
            restaurant: role.restaurant,
            customPermissions: role.customPermissions as string[] || [],
            isActive: role.isActive,
            createdAt: role.createdAt,
            updatedAt: role.updatedAt
          })),
          permissions,
          permissionCount: permissions.length
        };
      }
    }

    // Apply search filter if provided
    let filteredUsers = allUsers;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = allUsers.filter(user => 
        user.email.toLowerCase().includes(searchLower) ||
        user.firstName.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower) ||
        (user.userType && user.userType.toLowerCase().includes(searchLower))
      );
    }

    // Apply user type filter if provided
    if (userType) {
      filteredUsers = filteredUsers.filter(user => user.userType === userType);
    }

    // Sort by creation date (newest first)
    filteredUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const totalCount = filteredUsers.length;
    const paginatedUsers = filteredUsers.slice((page - 1) * limit, page * limit);

    // Get summary statistics
    const summary = {
      total: totalCount,
      platformAdmins: allUsers.filter(u => u.userType === 'platform_admin').length,
      restaurantOwners: allUsers.filter(u => u.userType === 'restaurant_owner').length,
      staff: allUsers.filter(u => u.userType === 'staff').length,
      active: allUsers.filter(u => u.isActive).length,
      inactive: allUsers.filter(u => !u.isActive).length
    };

    // Get RBAC statistics if roles are included
    let rbacStats = {};
    if (includeRoles) {
      const roleTemplateStats = await prisma.userRole.groupBy({
        by: ['roleTemplate'],
        _count: true,
        where: { isActive: true }
      });

      rbacStats = {
        totalRoles: await prisma.userRole.count({ where: { isActive: true } }),
        roleTemplateDistribution: roleTemplateStats.map(stat => ({
          template: stat.roleTemplate,
          count: stat._count
        }))
      };
    }

    return NextResponse.json({
      success: true,
      users: paginatedUsers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      summary,
      ...(includeRoles && { rbacStats }),
      meta: {
        requestedBy: context.user.id,
        requestedAt: new Date().toISOString(),
        includeRoles,
        includeInactive
      }
    });

  } catch (error) {
    console.error('Failed to fetch users:', error);
    
    // Log error for security monitoring
    await AuditLogger.logSecurityEvent(
      'system',
      'USER_FETCH_ERROR',
      'high',
      `Failed to fetch users: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          endpoint: 'admin/users',
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      }
    );

    return NextResponse.json(
      { 
        error: 'Failed to fetch users',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Create new user role
export async function POST(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['users:write'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 20 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { userId, userType, roleTemplate, restaurantId, customPermissions } = await request.json();
    
    // Validate input
    if (!userId || !userType || !roleTemplate) {
      return NextResponse.json(
        { error: 'User ID, user type, and role template are required' },
        { status: 400 }
      );
    }
    
    // Validate user type
    if (!['platform_admin', 'restaurant_owner', 'staff'].includes(userType)) {
      return NextResponse.json(
        { error: 'Invalid user type' },
        { status: 400 }
      );
    }
    
    // Validate role template
    if (!RBAC_CONSTANTS.ROLE_TEMPLATES.includes(roleTemplate)) {
      return NextResponse.json(
        { error: 'Invalid role template' },
        { status: 400 }
      );
    }
    
    // Validate restaurant requirement
    if (userType === 'restaurant_owner' || userType === 'staff') {
      if (!restaurantId) {
        return NextResponse.json(
          { error: 'Restaurant ID is required for restaurant owners and staff' },
          { status: 400 }
        );
      }
      
      // Verify restaurant exists
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
      return NextResponse.json(
        { error: 'User already has this role' },
        { status: 409 }
      );
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
    
    // Create user role
    const newUserRole = await prisma.userRole.create({
      data: {
        userId,
        userType,
        roleTemplate,
        restaurantId: restaurantId || null,
        customPermissions: customPermissions || [],
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
      }
    });
    
    // Clear user's permission cache
    PermissionManager.clearUserCache(userId);
    
    // Log audit trail
    await AuditLogger.logUserRoleChange(
      context.user.id,
      userId,
      'CREATE',
      {
        id: newUserRole.id,
        userType,
        roleTemplate,
        restaurantId,
        customPermissions: customPermissions || [],
        isActive: true
      },
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          newRoleId: newUserRole.id,
          assignedBy: context.user.id
        }
      }
    );
    
    return NextResponse.json({
      success: true,
      message: 'User role created successfully',
      userRole: {
        id: newUserRole.id,
        userId: newUserRole.userId,
        userType: newUserRole.userType,
        roleTemplate: newUserRole.roleTemplate,
        restaurantId: newUserRole.restaurantId,
        restaurant: newUserRole.restaurant,
        customPermissions: newUserRole.customPermissions as string[],
        isActive: newUserRole.isActive,
        createdAt: newUserRole.createdAt
      }
    }, { status: 201 });
  } catch (error) {
    console.error('User role creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/users - Update user role
export async function PUT(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['users:write'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 50 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { roleId, roleTemplate, customPermissions, isActive } = await request.json();
    
    // Validate input
    if (!roleId) {
      return NextResponse.json(
        { error: 'Role ID is required' },
        { status: 400 }
      );
    }
    
    // Get current role
    const currentRole = await prisma.userRole.findUnique({
      where: { id: roleId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });
    
    if (!currentRole) {
      return NextResponse.json(
        { error: 'User role not found' },
        { status: 404 }
      );
    }
    
    // Validate role template if provided
    if (roleTemplate && !RBAC_CONSTANTS.ROLE_TEMPLATES.includes(roleTemplate)) {
      return NextResponse.json(
        { error: 'Invalid role template' },
        { status: 400 }
      );
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
    
    // Update user role
    const updatedUserRole = await prisma.userRole.update({
      where: { id: roleId },
      data: {
        ...(roleTemplate && { roleTemplate }),
        ...(customPermissions && { customPermissions }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });
    
    // Clear user's permission cache
    PermissionManager.clearUserCache(currentRole.userId);
    
    // Log audit trail
    await AuditLogger.logUserRoleChange(
      context.user.id,
      currentRole.userId,
      'UPDATE',
      {
        id: roleId,
        userType: currentRole.userType,
        roleTemplate: roleTemplate || currentRole.roleTemplate,
        restaurantId: currentRole.restaurantId,
        customPermissions: customPermissions || currentRole.customPermissions as string[],
        isActive: isActive !== undefined ? isActive : currentRole.isActive
      },
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          roleId,
          changes: {
            roleTemplate: roleTemplate !== currentRole.roleTemplate ? 
              { from: currentRole.roleTemplate, to: roleTemplate } : undefined,
            customPermissions: customPermissions ? 
              { from: currentRole.customPermissions, to: customPermissions } : undefined,
            isActive: isActive !== currentRole.isActive ? 
              { from: currentRole.isActive, to: isActive } : undefined
          }
        }
      }
    );
    
    return NextResponse.json({
      success: true,
      message: 'User role updated successfully',
      userRole: {
        id: updatedUserRole.id,
        userId: updatedUserRole.userId,
        userType: updatedUserRole.userType,
        roleTemplate: updatedUserRole.roleTemplate,
        restaurantId: updatedUserRole.restaurantId,
        restaurant: updatedUserRole.restaurant,
        customPermissions: updatedUserRole.customPermissions as string[],
        isActive: updatedUserRole.isActive,
        updatedAt: updatedUserRole.updatedAt
      }
    });
  } catch (error) {
    console.error('User role update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users - Delete user role
export async function DELETE(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['users:delete'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 10 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { roleId } = await request.json();
    
    // Validate input
    if (!roleId) {
      return NextResponse.json(
        { error: 'Role ID is required' },
        { status: 400 }
      );
    }
    
    // Get current role
    const currentRole = await prisma.userRole.findUnique({
      where: { id: roleId }
    });
    
    if (!currentRole) {
      return NextResponse.json(
        { error: 'User role not found' },
        { status: 404 }
      );
    }
    
    // Check if user has other roles
    const otherRoles = await prisma.userRole.findMany({
      where: { 
        userId: currentRole.userId,
        id: { not: roleId },
        isActive: true
      }
    });
    
    if (otherRoles.length === 0) {
      return NextResponse.json(
        { error: 'Cannot delete the only role for a user' },
        { status: 409 }
      );
    }
    
    // Delete user role
    await prisma.userRole.delete({
      where: { id: roleId }
    });
    
    // Clear user's permission cache
    PermissionManager.clearUserCache(currentRole.userId);
    
    // Log audit trail
    await AuditLogger.logUserRoleChange(
      context.user.id,
      currentRole.userId,
      'DELETE',
      {
        id: roleId,
        userType: currentRole.userType,
        roleTemplate: currentRole.roleTemplate,
        restaurantId: currentRole.restaurantId,
        customPermissions: currentRole.customPermissions as string[],
        isActive: currentRole.isActive
      },
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          roleId,
          deletedBy: context.user.id
        }
      }
    );
    
    return NextResponse.json({
      success: true,
      message: 'User role deleted successfully',
      deletedRole: {
        id: roleId,
        userId: currentRole.userId,
        roleTemplate: currentRole.roleTemplate
      }
    });
  } catch (error) {
    console.error('User role deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}