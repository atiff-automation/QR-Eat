import { prisma } from '@/lib/database';
import { TenantContext, UserType } from '@/lib/tenant-context';
import { RBACError } from './types';

/**
 * Resource Authorization Library
 *
 * Provides helper functions to validate that a user has access to a specific
 * resource (Order, Table, Staff, etc.) based on their multi-tenant context.
 *
 * This prevents IDOR (Insecure Direct Object Reference) vulnerabilities where
 * a user might know a UUID of a resource belonging to another restaurant.
 */

/**
 * Validate user has access to a specific order
 */
export async function requireOrderAccess(
  orderId: string,
  context: TenantContext
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { restaurantId: true },
  });

  if (!order) {
    throw new RBACError('Order not found', 'NOT_FOUND', 404);
  }

  // Platform admins can access all
  if (context.isAdmin) return;

  // Staff must match restaurant
  if (context.userType === UserType.STAFF) {
    if (order.restaurantId !== context.restaurantId) {
      throw new RBACError(
        'Access denied: Order belongs to another restaurant',
        'FORBIDDEN',
        403
      );
    }
    return;
  }

  // Restaurant owners must own the restaurant
  if (context.userType === UserType.RESTAURANT_OWNER) {
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: order.restaurantId,
        ownerId: context.userId,
      },
    });

    if (!restaurant) {
      throw new RBACError(
        'Access denied: You do not own this restaurant',
        'FORBIDDEN',
        403
      );
    }
    return;
  }

  throw new RBACError(
    'Access denied: Unauthorized access attempt',
    'FORBIDDEN',
    403
  );
}

/**
 * Validate user has access to a specific table
 */
export async function requireTableAccess(
  tableId: string,
  context: TenantContext
): Promise<void> {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { restaurantId: true },
  });

  if (!table) {
    throw new RBACError('Table not found', 'NOT_FOUND', 404);
  }

  if (context.isAdmin) return;

  if (context.userType === UserType.STAFF) {
    if (table.restaurantId !== context.restaurantId) {
      throw new RBACError(
        'Access denied: Table belongs to another restaurant',
        'FORBIDDEN',
        403
      );
    }
    return;
  }

  if (context.userType === UserType.RESTAURANT_OWNER) {
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: table.restaurantId,
        ownerId: context.userId,
      },
    });

    if (!restaurant) {
      throw new RBACError(
        'Access denied: You do not own this restaurant',
        'FORBIDDEN',
        403
      );
    }
    return;
  }

  throw new RBACError(
    'Access denied: Unauthorized access attempt',
    'FORBIDDEN',
    403
  );
}

/**
 * Validate user has access to a specific staff member
 */
export async function requireStaffAccess(
  staffId: string,
  context: TenantContext
): Promise<void> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { restaurantId: true },
  });

  if (!staff) {
    throw new RBACError('Staff member not found', 'NOT_FOUND', 404);
  }

  if (context.isAdmin) return;

  if (context.userType === UserType.STAFF) {
    if (staff.restaurantId !== context.restaurantId) {
      throw new RBACError(
        'Access denied: Staff belongs to another restaurant',
        'FORBIDDEN',
        403
      );
    }
    return;
  }

  if (context.userType === UserType.RESTAURANT_OWNER) {
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: staff.restaurantId,
        ownerId: context.userId,
      },
    });

    if (!restaurant) {
      throw new RBACError(
        'Access denied: You do not own the restaurant this staff member belongs to',
        'FORBIDDEN',
        403
      );
    }
    return;
  }

  throw new RBACError(
    'Access denied: Unauthorized access attempt',
    'FORBIDDEN',
    403
  );
}

/**
 * Validate user has access to a specific restaurant
 */
export async function requireRestaurantAccess(
  restaurantId: string,
  context: TenantContext
): Promise<void> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, ownerId: true },
  });

  if (!restaurant) {
    throw new RBACError('Restaurant not found', 'NOT_FOUND', 404);
  }

  if (context.isAdmin) return;

  if (context.userType === UserType.STAFF) {
    if (restaurantId !== context.restaurantId) {
      throw new RBACError(
        'Access denied: You are not staff at this restaurant',
        'FORBIDDEN',
        403
      );
    }
    return;
  }

  if (context.userType === UserType.RESTAURANT_OWNER) {
    if (restaurant.ownerId !== context.userId) {
      throw new RBACError(
        'Access denied: You do not own this restaurant',
        'FORBIDDEN',
        403
      );
    }
    return;
  }

  throw new RBACError(
    'Access denied: Unauthorized access attempt',
    'FORBIDDEN',
    403
  );
}
