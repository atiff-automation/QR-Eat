/**
 * Durable cache-invalidation feed for the Counter.
 *
 * This is a signal log, not the source of truth: consumers pull changes since
 * their cursor and then refresh the affected snapshot. A failed write must not
 * fail the order/payment mutation; the Counter still polls, so the next poll
 * repairs a missed signal.
 */

import type { Prisma } from '@prisma/client';
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

/**
 * Transactional change row for B3 add-items/cancel/void/refund.
 *
 * Deliberately throws: the B3 contract makes the changes feed part of the
 * mutation, so a failed row rolls the mutation back. Every other caller keeps
 * using the best-effort `recordRestaurantChange()` above.
 */
export async function recordRestaurantChangeTx(
  tx: Prisma.TransactionClient,
  input: RestaurantChangeInput
): Promise<void> {
  await tx.restaurantChange.create({
    data: {
      restaurantId: input.restaurantId,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation ?? 'upsert',
    },
  });
}

export async function recordRestaurantChanges(
  inputs: RestaurantChangeInput[]
): Promise<void> {
  await Promise.all(inputs.map(recordRestaurantChange));
}

/** Delete feed rows older than the retention window. */
export async function cleanupRestaurantChanges(
  retentionDays: number = 7
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const result = await prisma.restaurantChange.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
