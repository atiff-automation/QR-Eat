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

import { describe, it, expect } from '@jest/globals';
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
) => ({
  method,
  json: async () => body || {},
  url: new URL(
    'http://localhost:3000/api/test?' + new URLSearchParams(params || {})
  ),
  headers: new Map([
    ['authorization', 'Bearer test-token'],
    ['content-type', 'application/json'],
    ['user-agent', 'test-agent'],
  ]),
});

// Mock database operations
jest.mock('@/lib/database', () => ({
  prisma: {
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    roleTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
      prisma.permission.findMany.mockResolvedValue([
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

      const { GET } = PermissionsRoute;
      const request = mockRequest('GET');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.permission.findMany).toHaveBeenCalled();
    });

    it('should create new permission successfully', async () => {
      // import moved to top
      const newPermission = {
        permissionKey: 'analytics:read',
        description: 'Read analytics data',
        category: 'analytics',
      };

      prisma.permission.findFirst.mockResolvedValue(null); // No existing permission
      prisma.permission.create.mockResolvedValue({
        id: '3',
        ...newPermission,
        isActive: true,
      });

      const { POST } = PermissionsRoute;
      const request = mockRequest('POST', newPermission);
      await POST(request);

      expect(prisma.permission.create).toHaveBeenCalledWith({
        data: {
          ...newPermission,
          isActive: true,
        },
      });
    });

    it('should prevent duplicate permission creation', async () => {
      // import moved to top
      const duplicatePermission = {
        permissionKey: 'users:read',
        description: 'Read user data',
        category: 'users',
      };

      prisma.permission.findFirst.mockResolvedValue({
        id: '1',
        permissionKey: 'users:read',
      });

      const { POST } = PermissionsRoute;
      const request = mockRequest('POST', duplicatePermission);
      const response = await POST(request);

      expect(response.status).toBe(409); // Conflict
    });
  });

  describe('Role Template Management', () => {
    it('should fetch role templates with statistics', async () => {
      // import moved to top
      prisma.roleTemplate.findMany.mockResolvedValue([
        {
          template: 'platform_admin',
          permissions: ['users:read', 'users:write'],
          isActive: true,
        },
      ]);

      prisma.userRole.groupBy.mockResolvedValue([
        {
          roleTemplate: 'platform_admin',
          _count: 5,
        },
      ]);

      const { GET } = RoleTemplatesRoute;
      const request = mockRequest('GET', null, { includeStats: 'true' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.roleTemplate.findMany).toHaveBeenCalled();
    });

    it('should create new role template', async () => {
      // import moved to top
      const newTemplate = {
        template: 'custom_admin',
        permissions: ['users:read', 'analytics:read'],
        description: 'Custom admin role',
      };

      prisma.roleTemplate.findFirst.mockResolvedValue(null);
      prisma.permission.findMany.mockResolvedValue([
        { permissionKey: 'users:read', isActive: true },
        { permissionKey: 'analytics:read', isActive: true },
      ]);
      prisma.roleTemplate.create.mockResolvedValue({
        id: '1',
        ...newTemplate,
        isActive: true,
      });

      const { POST } = RoleTemplatesRoute;
      const request = mockRequest('POST', newTemplate);
      await POST(request);

      expect(prisma.roleTemplate.create).toHaveBeenCalled();
    });
  });

  describe('User Role Management', () => {
    it('should assign role to user successfully', async () => {
      // import moved to top
      const roleAssignment = {
        userId: 'user-123',
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-456',
      };

      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'restaurant-456',
        isActive: true,
      });
      prisma.userRole.findFirst.mockResolvedValue(null); // No existing role
      prisma.userRole.create.mockResolvedValue({
        id: 'role-789',
        ...roleAssignment,
        isActive: true,
      });

      const { POST } = UsersRoute;
      const request = mockRequest('POST', roleAssignment);
      await POST(request);

      expect(prisma.userRole.create).toHaveBeenCalledWith({
        data: {
          ...roleAssignment,
          customPermissions: [],
          isActive: true,
        },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });
    });

    it('should update existing user role', async () => {
      // import moved to top
      const roleUpdate = {
        roleId: 'role-789',
        roleTemplate: 'manager',
        customPermissions: ['analytics:read'],
      };

      prisma.userRole.findUnique.mockResolvedValue({
        id: 'role-789',
        userId: 'user-123',
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-456',
      });

      prisma.permission.findMany.mockResolvedValue([
        { permissionKey: 'analytics:read', isActive: true },
      ]);

      prisma.userRole.update.mockResolvedValue({
        id: 'role-789',
        roleTemplate: 'manager',
        customPermissions: ['analytics:read'],
      });

      const { PUT } = UsersRoute;
      const request = mockRequest('PUT', roleUpdate);
      await PUT(request);

      expect(prisma.userRole.update).toHaveBeenCalled();
    });

    it('should delete user role with validation', async () => {
      // import moved to top
      const roleDelete = { roleId: 'role-789' };

      prisma.userRole.findUnique.mockResolvedValue({
        id: 'role-789',
        userId: 'user-123',
      });

      prisma.userRole.findMany.mockResolvedValue([
        { id: 'role-456', userId: 'user-123' }, // User has other roles
      ]);

      prisma.userRole.delete.mockResolvedValue({
        id: 'role-789',
      });

      const { DELETE } = UsersRoute;
      const request = mockRequest('DELETE', roleDelete);
      await DELETE(request);

      expect(prisma.userRole.delete).toHaveBeenCalledWith({
        where: { id: 'role-789' },
      });
    });
  });

  describe('Bulk Operations', () => {
    it('should perform bulk role assignment', async () => {
      // import moved to top
      const bulkOperation = {
        operation: 'assign',
        userIds: ['user-1', 'user-2', 'user-3'],
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-456',
      };

      // Mock user data
      prisma.platformAdmin.findMany.mockResolvedValue([]);
      prisma.restaurantOwner.findMany.mockResolvedValue([]);
      prisma.staff.findMany.mockResolvedValue([
        {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        {
          id: 'user-2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
        {
          id: 'user-3',
          firstName: 'Bob',
          lastName: 'Johnson',
          email: 'bob@example.com',
        },
      ]);

      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'restaurant-456',
        isActive: true,
      });

      // Mock no existing roles
      prisma.userRole.findFirst.mockResolvedValue(null);
      prisma.userRole.create.mockResolvedValue({
        id: 'new-role',
        ...bulkOperation,
      });

      const { POST } = UsersBulkRoute;
      const request = mockRequest('POST', bulkOperation);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(prisma.userRole.create).toHaveBeenCalledTimes(3);
    });

    it('should handle bulk operation failures gracefully', async () => {
      // import moved to top
      const bulkOperation = {
        operation: 'assign',
        userIds: ['user-1', 'user-2'],
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-456',
      };

      prisma.platformAdmin.findMany.mockResolvedValue([]);
      prisma.restaurantOwner.findMany.mockResolvedValue([]);
      prisma.staff.findMany.mockResolvedValue([
        { id: 'user-1', firstName: 'John', lastName: 'Doe' },
        { id: 'user-2', firstName: 'Jane', lastName: 'Smith' },
      ]);

      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'restaurant-456',
        isActive: true,
      });

      // Mock one success, one failure
      prisma.userRole.findFirst
        .mockResolvedValueOnce(null) // First user: no existing role
        .mockResolvedValueOnce({ id: 'existing' }); // Second user: has existing role

      prisma.userRole.create.mockResolvedValue({ id: 'new-role' });

      const { POST } = UsersBulkRoute;
      const request = mockRequest('POST', bulkOperation);
      const response = await POST(request);

      expect(response.data.summary.successful).toBe(1);
      expect(response.data.summary.failed).toBe(1);
    });
  });

  describe('Audit and Analytics', () => {
    it('should fetch user role audit history', async () => {
      // import moved to top

      prisma.platformAdmin.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      });

      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-1',
          action: 'CREATE',
          entityType: 'user_role',
          entityId: 'user-123',
          timestamp: new Date(),
          severity: 'medium',
          description: 'Role assigned',
          details: { roleTemplate: 'kitchen_staff' },
          metadata: { ipAddress: '127.0.0.1' },
          performedBy: {
            id: 'admin-1',
            email: 'admin@example.com',
            firstName: 'Admin',
            lastName: 'User',
          },
        },
      ]);

      const { GET } = AuditUserRolesRoute;
      const request = mockRequest('GET', null, { userId: 'user-123' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.auditLog.findMany).toHaveBeenCalled();
    });

    it('should generate role analytics successfully', async () => {
      // import moved to top

      // Mock analytics data
      prisma.platformAdmin.count.mockResolvedValue(5);
      prisma.restaurantOwner.count.mockResolvedValue(10);
      prisma.staff.count.mockResolvedValue(25);
      prisma.userRole.count.mockResolvedValue(40);
      prisma.permission.count.mockResolvedValue(50);

      prisma.userRole.groupBy.mockResolvedValue([
        { roleTemplate: 'platform_admin', _count: 5 },
        { roleTemplate: 'restaurant_owner', _count: 10 },
        { roleTemplate: 'kitchen_staff', _count: 15 },
        { roleTemplate: 'server', _count: 10 },
      ]);

      prisma.userRole.findMany.mockResolvedValue([
        {
          roleTemplate: 'kitchen_staff',
          customPermissions: ['analytics:read'],
        },
      ]);

      prisma.roleTemplate.findMany.mockResolvedValue([
        {
          template: 'kitchen_staff',
          permissions: ['orders:read', 'orders:write'],
        },
      ]);

      const { GET } = AnalyticsRolesRoute;
      const request = mockRequest('GET', null, { period: '30d' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.data.analytics.overview.totalUsers).toBe(40);
    });
  });

  describe('Security and Validation', () => {
    it('should enforce permission requirements', async () => {
      // Mock unauthorized access
      RBACMiddleware.protect.mockResolvedValueOnce({
        isAuthorized: false,
        response: {
          status: 403,
          json: { error: 'Access denied' },
        },
      });

      const { GET } = PermissionsRoute;
      const request = mockRequest('GET');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('should validate input data properly', async () => {
      // import moved to top
      const invalidRoleAssignment = {
        userId: '', // Invalid: empty user ID
        userType: 'invalid_type', // Invalid: not in allowed types
        roleTemplate: 'nonexistent_template', // Invalid: doesn't exist
      };

      const { POST } = UsersRoute;
      const request = mockRequest('POST', invalidRoleAssignment);
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should handle restaurant context validation', async () => {
      const roleAssignment = {
        userId: 'user-123',
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
        // Missing restaurantId for staff role
      };

      const { POST } = UsersRoute;
      const request = mockRequest('POST', roleAssignment);
      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Restaurant ID is required');
    });

    it('should prevent deletion of last user role', async () => {
      prisma.userRole.findUnique.mockResolvedValue({
        id: 'role-789',
        userId: 'user-123',
      });

      // Mock user has no other roles
      prisma.userRole.findMany.mockResolvedValue([]);

      const { DELETE } = UsersRoute;
      const request = mockRequest('DELETE', { roleId: 'role-789' });
      const response = await DELETE(request);

      expect(response.status).toBe(409);
      expect(response.data.error).toContain('Cannot delete the only role');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors', async () => {
      prisma.permission.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      const { GET } = PermissionsRoute;
      const request = mockRequest('GET');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it('should handle rate limiting properly', async () => {
      RBACMiddleware.protect.mockResolvedValueOnce({
        isAuthorized: false,
        response: {
          status: 429,
          json: { error: 'Rate limit exceeded' },
        },
      });

      const { POST } = UsersBulkRoute;
      const request = mockRequest('POST', {});
      const response = await POST(request);

      expect(response.status).toBe(429);
    });

    it('should validate bulk operation limits', async () => {
      const { POST } = UsersBulkRoute;

      const largeBulkOperation = {
        operation: 'assign',
        userIds: Array.from({ length: 100 }, (_, i) => `user-${i}`), // Over limit
        userType: 'staff',
        roleTemplate: 'kitchen_staff',
      };

      const request = mockRequest('POST', largeBulkOperation);
      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Maximum 50 users allowed');
    });
  });
});

// Integration Tests
describe('Role Management Integration Tests', () => {
  it('should complete full role assignment workflow', async () => {
    // import moved to top

    // 1. Create permission
    const permissionData = {
      permissionKey: 'test:integration',
      description: 'Integration test permission',
      category: 'test',
    };

    prisma.permission.findFirst.mockResolvedValue(null);
    prisma.permission.create.mockResolvedValue({
      id: 'perm-1',
      ...permissionData,
      isActive: true,
    });

    // 2. Create role template
    const templateData = {
      template: 'test_role',
      permissions: ['test:integration'],
      description: 'Test role template',
    };

    prisma.roleTemplate.findFirst.mockResolvedValue(null);
    prisma.permission.findMany.mockResolvedValue([
      { permissionKey: 'test:integration', isActive: true },
    ]);
    prisma.roleTemplate.create.mockResolvedValue({
      id: 'template-1',
      ...templateData,
      isActive: true,
    });

    // 3. Assign role to user
    const roleAssignment = {
      userId: 'test-user',
      userType: 'platform_admin',
      roleTemplate: 'test_role',
    };

    prisma.userRole.findFirst.mockResolvedValue(null);
    prisma.userRole.create.mockResolvedValue({
      id: 'role-1',
      ...roleAssignment,
      isActive: true,
    });

    // Execute workflow
    const { POST: createPermission } = PermissionsRoute;
    const { POST: createTemplate } = RoleTemplatesRoute;
    const { POST: assignRole } = UsersRoute;

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
