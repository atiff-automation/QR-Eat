/**
 * Test Utilities for RBAC System Testing
 *
 * This module provides utilities for testing RBAC system components including
 * mock authentication, database mocking, and test data factories.
 */

import { NextRequest } from 'next/server';
import {
  EnhancedJWTPayload,
  UserRole,
  RestaurantContext,
} from '@/lib/rbac/types';

// Mock User Types
export const mockPlatformAdmin = {
  id: 'admin-123',
  email: 'admin@tabtep.com',
  firstName: 'Admin',
  lastName: 'User',
  userType: 'platform_admin' as const,
  isActive: true,
  lastLoginAt: new Date(),
};

export const mockRestaurantOwner = {
  id: 'owner-123',
  email: 'owner@restaurant.com',
  firstName: 'Restaurant',
  lastName: 'Owner',
  userType: 'restaurant_owner' as const,
  isActive: true,
  lastLoginAt: new Date(),
};

export const mockStaffUser = {
  id: 'staff-123',
  email: 'staff@restaurant.com',
  firstName: 'Staff',
  lastName: 'Member',
  userType: 'staff' as const,
  isActive: true,
  lastLoginAt: new Date(),
};

// Mock Roles
export const mockPlatformAdminRole: UserRole = {
  id: 'role-admin-123',
  userType: 'platform_admin',
  roleTemplate: 'platform_admin',
  isActive: true,
};

export const mockRestaurantOwnerRole: UserRole = {
  id: 'role-owner-123',
  userType: 'restaurant_owner',
  roleTemplate: 'restaurant_owner',
  restaurantId: 'restaurant-123',
  isActive: true,
};

export const mockStaffRole: UserRole = {
  id: 'role-staff-123',
  userType: 'staff',
  roleTemplate: 'kitchen_staff',
  restaurantId: 'restaurant-123',
  isActive: true,
};

// Mock Restaurant Context
export const mockRestaurantContext: RestaurantContext = {
  id: 'restaurant-123',
  name: 'Test Restaurant',
  slug: 'test-restaurant',
  isActive: true,
  timezone: 'UTC',
  currency: 'USD',
};

// Mock JWT Payloads
export const mockPlatformAdminJWT: EnhancedJWTPayload = {
  userId: mockPlatformAdmin.id,
  email: mockPlatformAdmin.email,
  firstName: mockPlatformAdmin.firstName,
  lastName: mockPlatformAdmin.lastName,
  currentRole: mockPlatformAdminRole,
  availableRoles: [mockPlatformAdminRole],
  permissions: [
    'permissions:read',
    'permissions:write',
    'permissions:delete',
    'role_templates:read',
    'role_templates:write',
    'role_templates:delete',
    'users:read',
    'users:write',
    'users:delete',
    'platform:admin',
  ],
  sessionId: 'session-admin-123',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  iss: 'qr-restaurant-system',
  sub: mockPlatformAdmin.id,
};

export const mockRestaurantOwnerJWT: EnhancedJWTPayload = {
  userId: mockRestaurantOwner.id,
  email: mockRestaurantOwner.email,
  firstName: mockRestaurantOwner.firstName,
  lastName: mockRestaurantOwner.lastName,
  currentRole: mockRestaurantOwnerRole,
  availableRoles: [mockRestaurantOwnerRole],
  restaurantContext: mockRestaurantContext,
  permissions: [
    'restaurant:read',
    'restaurant:write',
    'menu:read',
    'menu:write',
    'orders:read',
    'orders:write',
    'staff:read',
    'staff:write',
  ],
  sessionId: 'session-owner-123',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  iss: 'qr-restaurant-system',
  sub: mockRestaurantOwner.id,
};

export const mockStaffJWT: EnhancedJWTPayload = {
  userId: mockStaffUser.id,
  email: mockStaffUser.email,
  firstName: mockStaffUser.firstName,
  lastName: mockStaffUser.lastName,
  currentRole: mockStaffRole,
  availableRoles: [mockStaffRole],
  restaurantContext: mockRestaurantContext,
  permissions: ['orders:read', 'orders:write', 'menu:read'],
  sessionId: 'session-staff-123',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  iss: 'qr-restaurant-system',
  sub: mockStaffUser.id,
};

// Mock Permissions
export const mockPermissions = [
  {
    id: 'perm-1',
    permissionKey: 'permissions:read',
    description: 'Read permissions',
    category: 'platform',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'perm-2',
    permissionKey: 'permissions:write',
    description: 'Write permissions',
    category: 'platform',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'perm-3',
    permissionKey: 'role_templates:read',
    description: 'Read role templates',
    category: 'platform',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'perm-4',
    permissionKey: 'users:read',
    description: 'Read users',
    category: 'users',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Mock Role Templates
export const mockRoleTemplates = [
  {
    template: 'platform_admin',
    permissions: [
      'permissions:read',
      'permissions:write',
      'role_templates:read',
      'users:read',
    ],
    permissionCount: 4,
    categories: ['platform', 'users'],
    description: 'Platform Administrator',
  },
  {
    template: 'restaurant_owner',
    permissions: [
      'restaurant:read',
      'restaurant:write',
      'menu:read',
      'menu:write',
    ],
    permissionCount: 4,
    categories: ['restaurant', 'menu'],
    description: 'Restaurant Owner',
  },
];

// Mock User Roles
export const mockUserRoles = [
  {
    id: 'user-role-1',
    userId: 'user-123',
    userType: 'platform_admin',
    roleTemplate: 'platform_admin',
    restaurantId: null,
    customPermissions: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'user-role-2',
    userId: 'user-456',
    userType: 'staff',
    roleTemplate: 'kitchen_staff',
    restaurantId: 'restaurant-123',
    customPermissions: ['orders:special'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Request Factory Functions
export function createMockRequest(options: {
  method: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  cookies?: Record<string, string>;
}): NextRequest {
  const {
    method,
    url = 'http://localhost:3000/api/test',
    headers = {},
    body,
    cookies = {},
  } = options;

  const mockHeaders = new Headers(headers);

  // Add authorization header if not provided
  if (!mockHeaders.has('authorization') && !mockHeaders.has('cookie')) {
    mockHeaders.set('authorization', 'Bearer mock-jwt-token');
  }

  const mockRequest = new NextRequest(url, {
    method,
    headers: mockHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Mock cookies
  Object.entries(cookies).forEach(([key, value]) => {
    mockRequest.cookies.set(key, value);
  });

  return mockRequest;
}

// Database Mock Factory
export function createMockPrisma() {
  return {
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    rolePermission: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    userRole: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    restaurant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    platformAdmin: {
      findMany: jest.fn(),
    },
    restaurantOwner: {
      findMany: jest.fn(),
    },
    staff: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

// Mock RBAC Middleware Results
export const mockAuthorizedResult = {
  isAuthorized: true,
  context: {
    user: mockPlatformAdmin,
    permissions: mockPlatformAdminJWT.permissions,
    session: {
      id: 'session-123',
      sessionId: 'session-admin-123',
      userId: mockPlatformAdmin.id,
      currentRoleId: mockPlatformAdminRole.id,
      permissions: mockPlatformAdminJWT.permissions,
      expiresAt: new Date(Date.now() + 3600000),
      lastActivity: new Date(),
    },
  },
};

export const mockUnauthorizedResult = {
  isAuthorized: false,
  response: {
    json: jest.fn().mockResolvedValue({ error: 'Access denied' }),
    status: 403,
  },
};

// Test Data Factories
export const testDataFactory = {
  permission: (overrides = {}) => ({
    id: 'perm-test-123',
    permissionKey: 'test:permission',
    description: 'Test permission',
    category: 'test',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  roleTemplate: (overrides = {}) => ({
    template: 'test_template',
    permissions: ['test:permission'],
    permissionCount: 1,
    categories: ['test'],
    description: 'Test role template',
    ...overrides,
  }),

  userRole: (overrides = {}) => ({
    id: 'user-role-test-123',
    userId: 'user-test-123',
    userType: 'staff',
    roleTemplate: 'test_template',
    restaurantId: 'restaurant-test-123',
    customPermissions: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  restaurant: (overrides = {}) => ({
    id: 'restaurant-test-123',
    name: 'Test Restaurant',
    slug: 'test-restaurant',
    isActive: true,
    ...overrides,
  }),

  auditLog: (overrides = {}) => ({
    id: 'audit-test-123',
    userId: 'user-test-123',
    action: 'TEST_ACTION',
    severity: 'medium',
    description: 'Test audit log entry',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  }),
};

// Mock Response Helpers
export const mockResponse = {
  json: (data: unknown, init?: ResponseInit) => ({
    json: jest.fn().mockResolvedValue(data),
    status: init?.status || 200,
    headers: init?.headers || {},
  }),

  error: (message: string, status = 500) => ({
    json: jest.fn().mockResolvedValue({ error: message }),
    status,
  }),
};

// Async Test Helpers
export const waitFor = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const flushPromises = () =>
  new Promise((resolve) => setImmediate(resolve));

// Mock Rate Limiter
export const mockRateLimiter = {
  isAllowed: jest.fn().mockResolvedValue(true),
  increment: jest.fn(),
  reset: jest.fn(),
};

// Mock Security Utils
export const mockSecurityUtils = {
  getClientIP: jest.fn().mockReturnValue('127.0.0.1'),
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
  generateToken: jest.fn(),
  validateToken: jest.fn(),
};

// Mock Audit Logger
export const mockAuditLogger = {
  logSecurityEvent: jest.fn(),
  logUserRoleChange: jest.fn(),
  logPermissionChange: jest.fn(),
  logSystemEvent: jest.fn(),
};

// Mock Permission Manager
export const mockPermissionManager = {
  getUserPermissions: jest.fn(),
  clearUserCache: jest.fn(),
  clearTemplateCache: jest.fn(),
  clearCache: jest.fn(),
  computeUserPermissions: jest.fn(),
  getAllPermissions: jest.fn(),
};

const testUtils = {
  mockPlatformAdmin,
  mockRestaurantOwner,
  mockStaffUser,
  mockPlatformAdminRole,
  mockRestaurantOwnerRole,
  mockStaffRole,
  mockRestaurantContext,
  mockPlatformAdminJWT,
  mockRestaurantOwnerJWT,
  mockStaffJWT,
  mockPermissions,
  mockRoleTemplates,
  mockUserRoles,
  createMockRequest,
  createMockPrisma,
  mockAuthorizedResult,
  mockUnauthorizedResult,
  testDataFactory,
  mockResponse,
  waitFor,
  flushPromises,
  mockRateLimiter,
  mockSecurityUtils,
  mockAuditLogger,
  mockPermissionManager,
};

export default testUtils;
