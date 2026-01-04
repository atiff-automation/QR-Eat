/**
 * Tenant Context Module - RBAC Edition
 *
 * Following CLAUDE.md principles:
 * - Type Safety: Proper TypeScript interfaces
 * - Error Handling: Comprehensive error scenarios
 * - RBAC Integration: Centralized authentication
 * - Audit Logging: Security event tracking
 */

import { NextRequest } from 'next/server';
import { prisma } from './database';
import { AuthServiceV2 } from './rbac/auth-service';
import type { EnhancedAuthenticatedUser } from './rbac/types';
import { AuditLogger } from './rbac/audit-logger';

// UserType enum for runtime type safety and proper comparisons
export enum UserType {
  PLATFORM_ADMIN = 'platform_admin',
  RESTAURANT_OWNER = 'restaurant_owner',
  STAFF = 'staff',
}

export interface TenantContext {
  userId: string;
  userType: UserType;
  email: string;
  restaurantId?: string;
  ownerId?: string;
  permissions: Record<string, string[]>;
  isAdmin: boolean;
  restaurantSlug?: string;
  roleTemplate?: string; // For staff: manager, waiter, kitchen, cashier
}

export interface RestaurantContext {
  id: string;
  name: string;
  slug: string;
  ownerId?: string;
  isActive: boolean;
}

/**
 * Extract tenant context from RBAC authentication
 *
 * Priority:
 * 1. Middleware headers (set by RBAC middleware) - fastest
 * 2. Direct RBAC token validation - fallback
 *
 * @param request - Next.js request object
 * @returns TenantContext or null if not authenticated
 */
export async function getTenantContext(
  request: NextRequest
): Promise<TenantContext | null> {
  // STRATEGY 1: Check middleware headers first (most efficient)
  const contextFromHeaders = extractContextFromHeaders(request);
  if (contextFromHeaders) {
    return contextFromHeaders;
  }

  // STRATEGY 2: Fallback to direct RBAC token validation
  return await extractContextFromToken(request);
}

/**
 * Extract context from middleware-injected headers
 * @internal
 */
function extractContextFromHeaders(request: NextRequest): TenantContext | null {
  const userId = request.headers.get('x-user-id');
  const userType = request.headers.get('x-user-type') as UserType;
  const email = request.headers.get('x-user-email');
  const isAdmin = request.headers.get('x-is-admin') === 'true';
  const restaurantId = request.headers.get('x-restaurant-id');
  const ownerId = request.headers.get('x-owner-id');
  const restaurantSlug = request.headers.get('x-restaurant-slug');
  const roleTemplate = request.headers.get('x-role-template');
  const permissionsHeader = request.headers.get('x-user-permissions');

  // All required headers must be present
  if (!userId || !userType || !email) {
    return null;
  }

  const permissions = parsePermissionsHeader(permissionsHeader);

  if (process.env.NODE_ENV === 'development') {
    console.log('✅ getTenantContext: Using middleware headers', {
      userId,
      userType,
    });
  }

  return {
    userId,
    userType,
    email,
    restaurantId: restaurantId || undefined,
    ownerId: ownerId || undefined,
    permissions,
    isAdmin,
    restaurantSlug: restaurantSlug || undefined,
    roleTemplate: roleTemplate || undefined,
  };
}

/**
 * Extract context from RBAC token cookie
 * @internal
 */
async function extractContextFromToken(
  request: NextRequest
): Promise<TenantContext | null> {
  const token = request.cookies.get('qr_rbac_token')?.value;

  if (!token) {
    // No token = anonymous user (not an error, just not authenticated)
    if (process.env.NODE_ENV === 'development') {
      console.log('ℹ️ getTenantContext: No RBAC token found');
    }
    return null;
  }

  try {
    const validation = await AuthServiceV2.validateToken(token);

    if (!validation.isValid || !validation.user) {
      // Invalid token - log security event
      await AuditLogger.logSecurityEvent(
        'anonymous',
        'INVALID_TOKEN_DIRECT',
        'low',
        'getTenantContext called with invalid RBAC token',
        {
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          metadata: {
            path: request.nextUrl.pathname,
            hasToken: true,
            validationFailed: true,
          },
        }
      );

      if (process.env.NODE_ENV === 'development') {
        console.log('❌ getTenantContext: RBAC token validation failed');
      }
      return null;
    }

    const user: EnhancedAuthenticatedUser = validation.user;

    if (process.env.NODE_ENV === 'development') {
      console.log('✅ getTenantContext: RBAC token validated', {
        userId: user.id,
        userType: user.currentRole.userType,
      });
    }

    return convertUserToTenantContext(user);
  } catch (error) {
    console.error('getTenantContext: RBAC validation error:', error);

    // Log unexpected errors
    await AuditLogger.logSecurityEvent(
      'system',
      'TENANT_CONTEXT_ERROR',
      'high',
      `getTenantContext error: ${error instanceof Error ? error.message : 'Unknown'}`,
      {
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          path: request.nextUrl.pathname,
          error: error instanceof Error ? error.stack : String(error),
        },
      }
    );

    return null;
  }
}

/**
 * Convert RBAC user to TenantContext format
 * @internal
 */
function convertUserToTenantContext(
  user: EnhancedAuthenticatedUser
): TenantContext {
  const permissions = parsePermissionsArray(user.permissions);

  return {
    userId: user.id,
    userType: user.currentRole.userType as UserType,
    email: user.email,
    restaurantId: user.restaurantContext?.id,
    ownerId:
      user.currentRole.userType === 'restaurant_owner' ? user.id : undefined,
    permissions,
    isAdmin: user.currentRole.userType === 'platform_admin',
    restaurantSlug: user.restaurantContext?.slug,
    roleTemplate: user.currentRole.roleTemplate,
  };
}

/**
 * Parse permissions header from middleware
 * @internal
 */
function parsePermissionsHeader(
  header: string | null
): Record<string, string[]> {
  if (!header) {
    return {};
  }

  try {
    const rbacPermissions = JSON.parse(header);
    return parsePermissionsArray(
      Array.isArray(rbacPermissions) ? rbacPermissions : []
    );
  } catch {
    return {};
  }
}

/**
 * Convert RBAC permissions array to tenant-context format
 * Example: ["orders:read", "orders:write"] -> { orders: ["read", "write"] }
 * @internal
 */
function parsePermissionsArray(
  permissionsArray: string[]
): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};

  permissionsArray.forEach((permission) => {
    if (typeof permission === 'string' && permission.includes(':')) {
      const [resource, action] = permission.split(':', 2);
      if (!permissions[resource]) {
        permissions[resource] = [];
      }
      permissions[resource].push(action);
    }
  });

  return permissions;
}

/**
 * Get restaurant context by slug
 */
export async function getRestaurantBySlug(
  slug: string
): Promise<RestaurantContext | null> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        isActive: true,
      },
    });

    return restaurant;
  } catch (error) {
    console.error('Error fetching restaurant by slug:', error);
    return null;
  }
}

/**
 * Check if user has permission for a specific action on a resource
 */
export function hasPermission(
  context: TenantContext,
  resource: string,
  action: string
): boolean {
  // Platform admins have all permissions
  if (context.isAdmin) {
    return true;
  }

  const resourcePermissions = context.permissions[resource];
  return resourcePermissions ? resourcePermissions.includes(action) : false;
}

/**
 * Enforce tenant isolation for restaurant-scoped operations
 */
export function enforceRestaurantAccess(
  context: TenantContext,
  targetRestaurantId: string
): boolean {
  // Platform admins can access any restaurant
  if (context.isAdmin) {
    return true;
  }

  // Staff can only access their assigned restaurant
  if (context.userType === UserType.STAFF) {
    return context.restaurantId === targetRestaurantId;
  }

  // Restaurant owners can access their restaurants
  if (context.userType === UserType.RESTAURANT_OWNER) {
    // We need to check if the restaurant belongs to this owner
    return true; // Will be validated in the API route
  }

  return false;
}

/**
 * Get all restaurants accessible by the current user
 */
export async function getUserRestaurants(
  context: TenantContext
): Promise<RestaurantContext[]> {
  try {
    // Platform admins can see all restaurants
    if (context.isAdmin) {
      const restaurants = await prisma.restaurant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });
      return restaurants;
    }

    // Restaurant owners can see their restaurants
    if (context.userType === UserType.RESTAURANT_OWNER) {
      const restaurants = await prisma.restaurant.findMany({
        where: { ownerId: context.userId },
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });
      return restaurants;
    }

    // Staff can only see their assigned restaurant
    if (context.userType === UserType.STAFF && context.restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: context.restaurantId },
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          isActive: true,
        },
      });
      return restaurant ? [restaurant] : [];
    }

    return [];
  } catch (error) {
    console.error('Error fetching user restaurants:', error);
    return [];
  }
}

/**
 * Create a Prisma where clause for restaurant-scoped queries
 */
export function createRestaurantFilter(
  context: TenantContext,
  restaurantIdField = 'restaurantId'
) {
  // Platform admins see all data
  if (context.isAdmin) {
    return {};
  }

  // Staff see only their restaurant's data
  if (context.userType === UserType.STAFF && context.restaurantId) {
    return { [restaurantIdField]: context.restaurantId };
  }

  // Restaurant owners see only their restaurants' data
  if (context.userType === UserType.RESTAURANT_OWNER) {
    return {
      restaurant: {
        ownerId: context.userId,
      },
    };
  }

  // Default: no access
  return { id: 'no-access' };
}

/**
 * Validate restaurant ownership for restaurant owners
 */
export async function validateRestaurantOwnership(
  ownerId: string,
  restaurantId: string
): Promise<boolean> {
  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        ownerId: ownerId,
      },
    });
    return !!restaurant;
  } catch (error) {
    console.error('Error validating restaurant ownership:', error);
    return false;
  }
}

/**
 * Get tenant-scoped Prisma client with automatic filtering
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getTenantPrisma(_context: TenantContext) {
  // For now, return the regular prisma client
  // In the future, we could implement automatic query filtering here
  return prisma;
}

/**
 * Middleware helper to enforce API route access control
 */
export function requireAuth(context: TenantContext | null): TenantContext {
  if (!context) {
    throw new Error('Authentication required');
  }
  return context;
}

/**
 * Middleware helper to require specific permissions
 */
export function requirePermission(
  context: TenantContext,
  resource: string,
  action: string
): void {
  if (!hasPermission(context, resource, action)) {
    throw new Error(`Permission denied: ${action} on ${resource}`);
  }
}

/**
 * Middleware helper to require restaurant access
 */
export async function requireRestaurantAccess(
  context: TenantContext,
  restaurantId: string
): Promise<void> {
  if (!enforceRestaurantAccess(context, restaurantId)) {
    throw new Error('Access denied: Restaurant access not allowed');
  }

  // Additional validation for restaurant owners
  if (context.userType === UserType.RESTAURANT_OWNER) {
    const hasAccess = await validateRestaurantOwnership(
      context.userId,
      restaurantId
    );
    if (!hasAccess) {
      throw new Error('Access denied: Restaurant not owned by user');
    }
  }
}
