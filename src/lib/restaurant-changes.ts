/**
 * Durable cache-invalidation feed for the Counter.
 *
 * This is a signal log, not the source of truth: consumers pull changes since
 * their cursor and then refresh the affected snapshot. A failed write must not
 * fail the order/payment mutation; the Counter still polls, so the next poll
 * repairs a missed signal.
 */

import { prisma } from '@/lib/database';

export type RestaurantChangeEntityType =
  | 'order'
  | 'payment'
  | 'table'
  | 'menu'
  | 'settings';

export interface RestaurantChangeInput {
  restaurantId: string;
  entityType: RestaurantChangeEntityType;
  entityId: string;
  operation?: 'upsert' | 'delete';
}

export async function recordRestaurantChange(
  input: RestaurantChangeInput
): Promise<void> {
  try {
    await prisma.restaurantChange.create({
      data: {
        restaurantId: input.restaurantId,
        entityType: input.entityType,
        entityId: input.entityId,
        operation: input.operation ?? 'upsert',
      },
    });
  } catch (error) {
    // Never fail the business mutation because the cache signal failed.
    console.error(
      `[restaurant-changes] failed to record ${input.entityType}:${input.entityId}`,
      error
    );
  }
}

export async function recordRestaurantChanges(
  inputs: RestaurantChangeInput[]
): Promise<void> {
  await Promise.all(inputs.map(recordRestaurantChange));
}
