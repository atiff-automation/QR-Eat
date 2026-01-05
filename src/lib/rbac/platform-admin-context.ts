import { prisma } from '@/lib/database';
import { TenantContext, requirePlatformAdmin } from '@/lib/tenant-context';

/**
 * Platform Admin Context Helper
 *
 * Provides metadata-only access for platform admins.
 * Platform admins can manage accounts and subscriptions but CANNOT access business data.
 */

/**
 * Get restaurant metadata (account status, subscription)
 * WITHOUT accessing business data (orders, menu, revenue)
 */
export async function getRestaurantMetadata(
  restaurantId: string,
  context: TenantContext
) {
  requirePlatformAdmin(context);

  return await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      owner: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      subscription: {
        select: {
          id: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          plan: {
            select: {
              name: true,
            },
          },
        },
      },
      // ❌ NO: orders, menu, revenue, analytics, staff details
    },
  });
}

/**
 * List all restaurants (metadata only)
 * For platform admin dashboard
 */
export async function listRestaurantsMetadata(context: TenantContext) {
  requirePlatformAdmin(context);

  return await prisma.restaurant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      owner: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      subscription: {
        select: {
          status: true,
          plan: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}
