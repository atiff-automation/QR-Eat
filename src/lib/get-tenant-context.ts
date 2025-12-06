import { NextRequest } from 'next/server';
import type { TenantContext } from './rls-schemas';
import { parseTenantContext, validateUserType } from './rls-schemas';
import {
  TENANT_HEADERS,
  USER_TYPES,
  DEFAULT_VALUES,
  RLS_ERRORS,
  SESSION_COOKIES,
} from './rls-constants';

/**
 * Extract tenant context from middleware-injected headers.
 * Middleware sets these headers after authentication:
 * - x-restaurant-id: Current restaurant ID
 * - x-user-id: Authenticated user ID
 * - x-user-type: User type (platform_admin, restaurant_owner, staff, customer)
 * - x-owner-id: Owner ID (for restaurant owners)
 * - x-is-admin: Boolean indicating platform admin status
 *
 * @param request - Next.js request object with headers
 * @returns Validated tenant context for RLS enforcement
 * @throws Error if required context is missing or validation fails
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const context = getTenantContext(request);
 *   const orders = await withTenantContext(context, async (tx) =>
 *     tx.order.findMany()
 *   );
 *   return Response.json(orders);
 * }
 */
export function getTenantContext(request: NextRequest): TenantContext {
  try {
    const restaurantId = request.headers.get(TENANT_HEADERS.RESTAURANT_ID);
    const userId = request.headers.get(TENANT_HEADERS.USER_ID);
    const userType = request.headers.get(TENANT_HEADERS.USER_TYPE);
    const ownerId = request.headers.get(TENANT_HEADERS.OWNER_ID);
    const isAdmin = request.headers.get(TENANT_HEADERS.IS_ADMIN) === 'true';

    // Validate user type exists
    if (!userType) {
      throw new Error(RLS_ERRORS.MISSING_USER_TYPE);
    }

    // Validate user type is allowed
    if (!validateUserType(userType)) {
      throw new Error(`${RLS_ERRORS.INVALID_USER_TYPE}: ${userType}`);
    }

    // Platform admins don't need restaurant context
    if (userType === USER_TYPES.PLATFORM_ADMIN || isAdmin) {
      const adminContext = {
        restaurantId: restaurantId || DEFAULT_VALUES.ANONYMOUS_USER_ID,
        userId: userId || DEFAULT_VALUES.ANONYMOUS_USER_ID,
        userType: USER_TYPES.PLATFORM_ADMIN,
      };

      // Validate with Zod before returning
      return parseTenantContext(adminContext);
    }

    // Non-admins MUST have restaurant context
    if (!restaurantId) {
      throw new Error(RLS_ERRORS.MISSING_RESTAURANT_CONTEXT);
    }

    if (!userId) {
      throw new Error(RLS_ERRORS.MISSING_USER_ID);
    }

    // Build tenant context
    const context: Partial<TenantContext> = {
      restaurantId,
      userId,
      userType: userType as TenantContext['userType'],
    };

    // Add owner ID for restaurant owners
    if (userType === USER_TYPES.RESTAURANT_OWNER && ownerId) {
      context.ownerId = ownerId;
    }

    // Validate with Zod before returning
    return parseTenantContext(context);
  } catch (error) {
    // Provide clear error messages for debugging
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to extract tenant context from request');
  }
}

/**
 * Extract customer session context from headers and cookies.
 * Used for customer-facing endpoints where session token is needed.
 *
 * @param request - Next.js request object
 * @returns Validated tenant context with customer session token
 * @throws Error if restaurant context, session token is missing, or validation fails
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   const context = getCustomerContext(request);
 *   const order = await asCustomer(
 *     context.restaurantId,
 *     context.customerSessionToken!,
 *     async (tx) => tx.order.create({ data: orderData })
 *   );
 *   return Response.json(order);
 * }
 */
export function getCustomerContext(request: NextRequest): TenantContext {
  try {
    const restaurantId = request.headers.get(TENANT_HEADERS.RESTAURANT_ID);
    const sessionToken = request.cookies.get(SESSION_COOKIES.CUSTOMER)?.value;

    if (!restaurantId) {
      throw new Error(RLS_ERRORS.MISSING_CUSTOMER_SUBDOMAIN);
    }

    if (!sessionToken) {
      throw new Error(RLS_ERRORS.MISSING_CUSTOMER_SESSION);
    }

    const customerContext = {
      restaurantId,
      userId: DEFAULT_VALUES.ANONYMOUS_USER_ID,
      userType: USER_TYPES.CUSTOMER,
      customerSessionToken: sessionToken,
    };

    // Validate with Zod before returning
    return parseTenantContext(customerContext);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to extract customer context from request');
  }
}

/**
 * Check if the current request is from a platform admin.
 * Useful for conditional logic in API routes.
 *
 * @param request - Next.js request object
 * @returns True if user is platform admin
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   if (isPlatformAdmin(request)) {
 *     // Allow access to admin-only data
 *   }
 * }
 */
export function isPlatformAdmin(request: NextRequest): boolean {
  const isAdmin = request.headers.get(TENANT_HEADERS.IS_ADMIN) === 'true';
  const userType = request.headers.get(TENANT_HEADERS.USER_TYPE);
  return isAdmin || userType === USER_TYPES.PLATFORM_ADMIN;
}

/**
 * Validate that the user has permission to access a specific restaurant.
 * Used for additional authorization checks beyond RLS.
 *
 * @param request - Next.js request object
 * @param targetRestaurantId - Restaurant ID being accessed
 * @returns True if user can access the restaurant
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const { searchParams } = new URL(request.url);
 *   const restaurantId = searchParams.get('restaurantId');
 *
 *   if (!canAccessRestaurant(request, restaurantId)) {
 *     return Response.json({ error: 'Forbidden' }, { status: 403 });
 *   }
 * }
 */
export function canAccessRestaurant(
  request: NextRequest,
  targetRestaurantId: string
): boolean {
  // Platform admins can access any restaurant
  if (isPlatformAdmin(request)) {
    return true;
  }

  // Non-admins can only access their current restaurant
  const currentRestaurantId = request.headers.get(TENANT_HEADERS.RESTAURANT_ID);
  return currentRestaurantId === targetRestaurantId;
}
