import { NextRequest } from 'next/server';
import { UserType, AuthService } from './auth';
import { prisma } from './prisma';

export interface TenantContext {
  userId: string;
  userType: UserType;
  email: string;
  restaurantId?: string;
  ownerId?: string;
  permissions: Record<string, string[]>;
  isAdmin: boolean;
  restaurantSlug?: string;
}

export interface RestaurantContext {
  id: string;
  name: string;
  slug: string;
  ownerId?: string;
  isActive: boolean;
}

/**
 * Extract tenant context from middleware headers or fallback to direct token verification
 */
export function getTenantContext(request: NextRequest): TenantContext | null {
  const userId = request.headers.get('x-user-id');
  const userType = request.headers.get('x-user-type') as UserType;
  const email = request.headers.get('x-user-email');
  const isAdmin = request.headers.get('x-is-admin') === 'true';
  const restaurantId = request.headers.get('x-restaurant-id');
  const ownerId = request.headers.get('x-owner-id');
  const restaurantSlug = request.headers.get('x-restaurant-slug');
  const permissionsHeader = request.headers.get('x-user-permissions');

  // If middleware headers are available, use them
  if (userId && userType && email) {
    let permissions: Record<string, string[]> = {};
    if (permissionsHeader) {
      try {
        permissions = JSON.parse(permissionsHeader);
      } catch {
        // Fallback to empty permissions if parsing fails
        permissions = {};
      }
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
    };
  }

  // Fallback: Extract token directly and verify
  try {
    const token = request.cookies.get('qr_auth_token')?.value ||
                  AuthService.extractTokenFromHeader(request.headers.get('authorization'));
    
    if (!token) {
      return null;
    }

    const payload = AuthService.verifyToken(token);
    if (!payload) {
      return null;
    }

    return {
      userId: payload.userId,
      userType: payload.userType,
      email: payload.email,
      restaurantId: payload.restaurantId || undefined,
      ownerId: payload.ownerId || undefined,
      permissions: payload.permissions || {},
      isAdmin: payload.userType === UserType.PLATFORM_ADMIN,
      restaurantSlug: restaurantSlug || undefined,
    };
  } catch (error) {
    console.error('Failed to extract tenant context:', error);
    return null;
  }
}

/**
 * Get restaurant context by slug
 */
export async function getRestaurantBySlug(slug: string): Promise<RestaurantContext | null> {
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
export async function getUserRestaurants(context: TenantContext): Promise<RestaurantContext[]> {
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
export function createRestaurantFilter(context: TenantContext, restaurantIdField = 'restaurantId') {
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
export function getTenantPrisma(context: TenantContext) {
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
    const hasAccess = await validateRestaurantOwnership(context.userId, restaurantId);
    if (!hasAccess) {
      throw new Error('Access denied: Restaurant not owned by user');
    }
  }
}