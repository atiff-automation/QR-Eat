/**
 * Comprehensive Test Suite for Role Management System
 *
 * Tests all aspects of the RBAC implementation including:
 * - Permission management APIs
 * - Role template operations
 * - User role assignment and management
 * - Bulk operations
 * - Audit logging
 * - Analytics functionality
 */

import { describe, it, expect, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { RBACMiddleware } from '@/middleware/rbac-middleware';
import * as PermissionsRoute from '@/app/api/admin/permissions/route';
import * as RoleTemplatesRoute from '@/app/api/admin/role-templates/route';
import * as UsersRoute from '@/app/api/admin/users/route';
import * as UsersBulkRoute from '@/app/api/admin/users/bulk/route';
import * as AuditUserRolesRoute from '@/app/api/admin/audit/user-roles/route';
import * as AnalyticsRolesRoute from '@/app/api/admin/analytics/roles/route';

// Mock the Next.js request/response for testing
const mockRequest = (
  method: string,
  body?: unknown,
  params?: { [key: string]: string }
) => {
  const url = new URL(
    'http://localhost:3000/api/test?' + new URLSearchParams(params || {})
  );

  return {
    method,
    json: async () => body || {},
    url: url.toString(),
    nextUrl: url,
    headers: new Headers({
      'authorization': 'Bearer test-token',
      'content-type': 'application/json',
      'user-agent': 'test-agent',
    }),
    cookies: {
      get: jest.fn(),
      set: jest.fn(),
      getAll: jest.fn(),
      delete: jest.fn(),
      has: jest.fn(),
      clear: jest.fn(),
    },
  } as unknown as NextRequest;
};

// Mock database operations
jest.mock('@/lib/database', () => ({
  prisma: {
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    rolePermission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    userRole: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    restaurant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    platformAdmin: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    restaurantOwner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    staff: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

// Mock RBAC middleware
jest.mock('@/middleware/rbac-middleware', () => ({
  RBACMiddleware: {
    protect: jest.fn().mockResolvedValue({
      isAuthorized: true,
      context: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          userType: 'platform_admin',
          isActive: true,
        },
      },
    }),
  },
}));

// Mock audit logger
jest.mock('@/lib/rbac/audit-logger', () => ({
  AuditLogger: {
    logPermissionChange: jest.fn(),
    logUserRoleChange: jest.fn(),
    logSecurityEvent: jest.fn(),
  },
}));

// Mock permission manager
jest.mock('@/lib/rbac/permissions', () => ({
  PermissionManager: {
    getUserPermissions: jest
      .fn()
      .mockResolvedValue(['users:read', 'users:write']),
    clearUserCache: jest.fn(),
    getAllPermissions: jest.fn().mockResolvedValue([
      { permissionKey: 'users:read', category: 'users' },
      { permissionKey: 'users:write', category: 'users' },
    ]),
  },
}));

describe('Role Management System Tests', () => {
  describe('Permission Management API', () => {
    it('should fetch all permissions successfully', async () => {
      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        {
          id: '1',
          permissionKey: 'users:read',
          description: 'Read user data',
          category: 'users',
          isActive: true,
        },
        {
          id: '2',
          permissionKey: 'users:write',
          description: 'Write user data',
          category: 'users',
          isActive: true,
        },
      ]);

      const { GET } = PermissionsRoute as any;
      const request = mockRequest('GET');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.permission.findMany).toHaveBeenCalled();
    });

    it('should create new permission successfully', async () => {
      const newPermission = {
        permissionKey: 'analytics:read',
        description: 'Read analytics data',
        category: 'analytics',
      };

      (prisma.permission.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.permission.create as jest.Mock).mockResolvedValue({
        id: '3',
        ...newPermission,
        isActive: true,
      });

      const { POST } = PermissionsRoute as any;
      const request = mockRequest('POST', newPermission);
      await POST(request);

      expect(prisma.permission.create).toHaveBeenCalled();
    });

    it('should prevent duplicate permission creation', async () => {
      const duplicatePermission = {
        permissionKey: 'users:read',
        description: 'Read user data',
        category: 'users',
      };

      (prisma.permission.findFirst as jest.Mock).mockResolvedValue({
        id: '1',
        permissionKey: 'users:read',
      });

      const { POST } = PermissionsRoute as any;
      const request = mockRequest('POST', duplicatePermission);
      const response = await POST(request);

      expect(response.status).toBe(409);
    });
  });

  describe('Role Template Management', () => {
    it('should fetch role templates with statistics', async () => {
      (prisma.rolePermission.findMany as jest.Mock).mockResolvedValue([
        {
          roleTemplate: 'platform_admin',
          permissionKey: 'users:read',
        },
      ]);

      (prisma.userRole.groupBy as jest.Mock).mockResolvedValue([
        {
          roleTemplate: 'platform_admin',
          _count: 5,
        },
      ]);

      const { GET } = RoleTemplatesRoute as any;
      const request = mockRequest('GET', null, { includeStats: 'true' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.rolePermission.findMany).toHaveBeenCalled();
    });

    it('should create new role template', async () => {
      const newTemplate = {
        template: 'custom_admin',
        permissions: ['users:read', 'analytics:read'],
        description: 'Custom admin role',
      };

      (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        { permissionKey: 'users:read', isActive: true },
        { permissionKey: 'analytics:read', isActive: true },
      ]);
      (prisma.rolePermission.create as jest.Mock).mockResolvedValue({
        id: '1',
        ...newTemplate,
        isActive: true,
      });

      const { POST } = RoleTemplatesRoute as any;
      const request = mockRequest('POST', newTemplate);
      await POST(request);

      expect(prisma.rolePermission.create).toHaveBeenCalled();
    });
  });

  describe('User Role Management', () => {
    it('should assign role to user successfully', async () => {
      const roleAssignment = {
        userId: 'user-123',
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-456',
      };

      (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
        id: 'restaurant-456',
        isActive: true,
      });
      (prisma.userRole.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userRole.create as jest.Mock).mockResolvedValue({
        id: 'role-789',
        ...roleAssignment,
        isActive: true,
      });

      const { POST } = UsersRoute as any;
      const request = mockRequest('POST', roleAssignment);
      await POST(request);

      expect(prisma.userRole.create).toHaveBeenCalled();
    });

    it('should update existing user role', async () => {
      const roleUpdate = {
        roleId: 'role-789',
        roleTemplate: 'manager',
        customPermissions: ['analytics:read'],
      };

      (prisma.userRole.findUnique as jest.Mock).mockResolvedValue({
        id: 'role-789',
        userId: 'user-123',
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-456',
      });

      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        { permissionKey: 'analytics:read', isActive: true },
      ]);

      (prisma.userRole.update as jest.Mock).mockResolvedValue({
        id: 'role-789',
        roleTemplate: 'manager',
        customPermissions: ['analytics:read'],
      });

      const { PUT } = UsersRoute as any;
      const request = mockRequest('PUT', roleUpdate);
      await PUT(request);

      expect(prisma.userRole.update).toHaveBeenCalled();
    });

    it('should delete user role with validation', async () => {
      const roleDelete = { roleId: 'role-789' };

      (prisma.userRole.findUnique as jest.Mock).mockResolvedValue({
        id: 'role-789',
        userId: 'user-123',
      });

      (prisma.userRole.findMany as jest.Mock).mockResolvedValue([
        { id: 'role-456', userId: 'user-123' },
      ]);

      (prisma.userRole.delete as jest.Mock).mockResolvedValue({
        id: 'role-789',
      });

      const { DELETE } = UsersRoute as any;
      const request = mockRequest('DELETE', roleDelete);
      await DELETE(request);

      expect(prisma.userRole.delete).toHaveBeenCalled();
    });
  });

  describe('Bulk Operations', () => {
    it('should perform bulk role assignment', async () => {
      const bulkOperation = {
        operation: 'assign',
        userIds: ['user-1', 'user-2', 'user-3'],
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-456',
      };

      (prisma.platformAdmin.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.restaurantOwner.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.staff.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ]);

      (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
        id: 'restaurant-456',
        isActive: true,
      });

      (prisma.userRole.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userRole.create as jest.Mock).mockResolvedValue({
        id: 'new-role',
        ...bulkOperation,
      });

      const { POST } = UsersBulkRoute as any;
      const request = mockRequest('POST', bulkOperation);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(prisma.userRole.create).toHaveBeenCalledTimes(3);
    });

    it('should handle bulk operation failures gracefully', async () => {
      const bulkOperation = {
        operation: 'assign',
        userIds: ['user-1', 'user-2'],
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-456',
      };

      (prisma.platformAdmin.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.restaurantOwner.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.staff.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]);

      (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
        id: 'restaurant-456',
        isActive: true,
      });

      (prisma.userRole.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });

      (prisma.userRole.create as jest.Mock).mockResolvedValue({ id: 'new-role' });

      const { POST } = UsersBulkRoute as any;
      const request = mockRequest('POST', bulkOperation);
      const response = await POST(request);
      const data = await response.json();

      expect(data.summary.successful).toBe(1);
      expect(data.summary.failed).toBe(1);
    });
  });

  describe('Audit and Analytics', () => {
    it('should fetch user role audit history', async () => {
      (prisma.platformAdmin.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'audit-1',
          action: 'CREATE',
          entityType: 'user_role',
          timestamp: new Date(),
        },
      ]);

      const { GET } = AuditUserRolesRoute as any;
      const request = mockRequest('GET', null, { userId: 'user-123' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.auditLog.findMany).toHaveBeenCalled();
    });

    it('should generate role analytics successfully', async () => {
      (prisma.platformAdmin.count as jest.Mock).mockResolvedValue(5);
      (prisma.restaurantOwner.count as jest.Mock).mockResolvedValue(10);
      (prisma.staff.count as jest.Mock).mockResolvedValue(25);
      (prisma.userRole.count as jest.Mock).mockResolvedValue(40);
      (prisma.permission.count as jest.Mock).mockResolvedValue(50);

      (prisma.userRole.groupBy as jest.Mock).mockResolvedValue([
        { roleTemplate: 'platform_admin', _count: 5 },
        { roleTemplate: 'restaurant_owner', _count: 10 },
      ]);

      (prisma.userRole.findMany as jest.Mock).mockResolvedValue([
        {
          roleTemplate: 'kitchen_staff',
          customPermissions: ['analytics:read'],
        },
      ]);

      (prisma.rolePermission.findMany as jest.Mock).mockResolvedValue([
        {
          roleTemplate: 'kitchen_staff',
          permissionKey: 'orders:read',
        },
      ]);

      const { GET } = AnalyticsRolesRoute as any;
      const request = mockRequest('GET', null, { period: '30d' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.analytics.overview.totalUsers).toBe(40);
    });
  });

  describe('Security and Validation', () => {
    it('should enforce permission requirements', async () => {
      (RBACMiddleware.protect as jest.Mock).mockResolvedValueOnce({
        isAuthorized: false,
        response: new NextResponse(JSON.stringify({ error: 'Access denied' }), { status: 403 }),
      });

      const { GET } = PermissionsRoute as any;
      const request = mockRequest('GET');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('should validate input data properly', async () => {
      const invalidRoleAssignment = {
        userId: '',
        userType: 'invalid_type',
        roleTemplate: 'nonexistent_template',
      };

      const { POST } = UsersRoute as any;
      const request = mockRequest('POST', invalidRoleAssignment);
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should handle restaurant context validation', async () => {
      const roleAssignment = {
        userId: 'user-123',
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
      };

      const { POST } = UsersRoute as any;
      const request = mockRequest('POST', roleAssignment);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Restaurant ID is required');
    });

    it('should prevent deletion of last user role', async () => {
      (prisma.userRole.findUnique as jest.Mock).mockResolvedValue({
        id: 'role-789',
        userId: 'user-123',
      });

      (prisma.userRole.findMany as jest.Mock).mockResolvedValue([]);

      const { DELETE } = UsersRoute as any;
      const request = mockRequest('DELETE', { roleId: 'role-789' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain('Cannot delete the only role');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors', async () => {
      (prisma.permission.findMany as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const { GET } = PermissionsRoute as any;
      const request = mockRequest('GET');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it('should handle rate limiting properly', async () => {
      (RBACMiddleware.protect as jest.Mock).mockResolvedValueOnce({
        isAuthorized: false,
        response: new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 }),
      });

      const { POST } = UsersBulkRoute as any;
      const request = mockRequest('POST', {});
      const response = await POST(request);

      expect(response.status).toBe(429);
    });

    it('should validate bulk operation limits', async () => {
      const largeBulkOperation = {
        operation: 'assign',
        userIds: Array.from({ length: 100 }, (_, i) => `user-${i}`),
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
      };

      const { POST } = UsersBulkRoute as any;
      const request = mockRequest('POST', largeBulkOperation);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Maximum 50 users allowed');
    });
  });
});

describe('Role Management Integration Tests', () => {
  it('should complete full role assignment workflow', async () => {
    const permissionData = {
      permissionKey: 'test:integration',
      description: 'Integration test permission',
      category: 'test',
    };

    (prisma.permission.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.permission.create as jest.Mock).mockResolvedValue({
      id: 'perm-1',
      ...permissionData,
      isActive: true,
    });

    const templateData = {
      template: 'test_role',
      permissions: ['test:integration'],
      description: 'Test role template',
    };

    (prisma.rolePermission.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.permission.findMany as jest.Mock).mockResolvedValue([
      { permissionKey: 'test:integration', isActive: true },
    ]);
    (prisma.rolePermission.create as jest.Mock).mockResolvedValue({
      id: 'template-1',
      ...templateData,
      isActive: true,
    });

    const roleAssignment = {
      userId: 'test-user',
      userType: 'platform_admin',
      roleTemplate: 'test_role',
    };

    (prisma.userRole.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userRole.create as jest.Mock).mockResolvedValue({
      id: 'role-1',
      ...roleAssignment,
      isActive: true,
    });

    const { POST: createPermission } = PermissionsRoute as any;
    const { POST: createTemplate } = RoleTemplatesRoute as any;
    const { POST: assignRole } = UsersRoute as any;

    const permissionResult = await createPermission(
      mockRequest('POST', permissionData)
    );
    const templateResult = await createTemplate(
      mockRequest('POST', templateData)
    );
    const roleResult = await assignRole(mockRequest('POST', roleAssignment));

    expect(permissionResult.status).toBe(201);
    expect(templateResult.status).toBe(201);
    expect(roleResult.status).toBe(201);
  });
});
