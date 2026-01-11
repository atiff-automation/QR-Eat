/**
 * Table Status Manager
 *
 * Centralized utility for automatic table status management.
 * Handles auto-clearing table status when all orders are completed.
 */

import { prisma } from '@/lib/database';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { Prisma } from '@prisma/client';

/**
 * Determines if a table should be marked as available based on its orders
 *
 * @param tableId - The ID of the table to check
 * @param tx - Optional transaction client for atomic operations
 * @returns true if table should be available, false otherwise
 */
export async function shouldTableBeAvailable(
  tableId: string,
  tx?: Prisma.TransactionClient
): Promise<boolean> {
  const db = tx || prisma;

  try {
    const activeOrderCount = await db.order.count({
      where: {
        tableId,
        OR: [
          // Active workflow orders (food not yet delivered to customer)
          // These keep table occupied regardless of payment status
          {
            status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
          },
          // Served but unpaid (customer still dining, needs to pay)
          {
            status: 'SERVED',
            paymentStatus: 'PENDING',
          },
        ],
      },
    });

    // Table should be available if there are no active orders
    return activeOrderCount === 0;
  } catch (error) {
    console.error(
      '[TableStatusManager] Error checking table availability:',
      error
    );
    // On error, assume table should stay in current state (safe default)
    return false;
  }
}

/**
 * Automatically update table status based on order states
 *
 * This function is idempotent and safe to call multiple times.
 * It will only update the table status if needed.
 *
 * @param tableId - The ID of the table to update
 * @param tx - Optional transaction client for atomic operations
 * @returns Promise that resolves when update is complete
 */
export async function autoUpdateTableStatus(
  tableId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = tx || prisma;

  try {
    // Get current table status
    const table = await db.table.findUnique({
      where: { id: tableId },
      select: { status: true, tableNumber: true, restaurantId: true },
    });

    if (!table) {
      console.warn(`[TableStatusManager] Table ${tableId} not found`);
      return;
    }

    // Check if table should be available
    const shouldBeAvailable = await shouldTableBeAvailable(tableId, tx);

    // Only update if status needs to change
    if (shouldBeAvailable && table.status === 'OCCUPIED') {
      await db.table.update({
        where: { id: tableId },
        data: {
          status: 'AVAILABLE',
          updatedAt: new Date(),
        },
      });

      console.log(
        `[TableStatusManager] Auto-cleared table ${table.tableNumber} (${tableId}) to available`
      );

      // Publish real-time update
      // PubSub is outside transaction as it's a side effect
      // Ideally run this AFTER transaction commits, but for now we run it here
      await PostgresEventManager.publishTableStatusChange({
        tableId,
        restaurantId: table.restaurantId,
        previousStatus: table.status,
        newStatus: 'AVAILABLE',
        updatedBy: 'system',
        timestamp: Date.now(),
      });
    } else if (!shouldBeAvailable && table.status === 'AVAILABLE') {
      // Edge case: Table is available but has active orders
      // This shouldn't happen in normal flow, but we'll fix it
      await db.table.update({
        where: { id: tableId },
        data: {
          status: 'OCCUPIED',
          updatedAt: new Date(),
        },
      });

      console.log(
        `[TableStatusManager] Auto-set table ${table.tableNumber} (${tableId}) to occupied`
      );

      // Publish real-time update
      await PostgresEventManager.publishTableStatusChange({
        tableId,
        restaurantId: table.restaurantId,
        previousStatus: table.status,
        newStatus: 'OCCUPIED',
        updatedBy: 'system',
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    // Log error but don't throw - this is a non-critical operation
    // The main order flow should not be blocked by status update failures
    console.error('[TableStatusManager] Error updating table status:', error);
  }
}

/**
 * Get active order count for a table (for "Items Pending" display)
 *
 * This excludes "ready" status to show only items still being prepared.
 *
 * @param tableId - The ID of the table
 * @returns Number of items pending preparation
 */
export async function getActiveOrderCount(tableId: string): Promise<number> {
  try {
    return await prisma.order.count({
      where: {
        tableId,
        status: {
          in: ['PENDING', 'CONFIRMED', 'PREPARING'],
        },
      },
    });
  } catch (error) {
    console.error(
      '[TableStatusManager] Error getting active order count:',
      error
    );
    return 0;
  }
}
