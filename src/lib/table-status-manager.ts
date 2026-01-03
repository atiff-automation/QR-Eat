/**
 * Table Status Manager
 *
 * Centralized utility for automatic table status management.
 * Handles auto-clearing table status when all orders are completed.
 */

import { prisma } from '@/lib/database';

/**
 * Active order statuses that keep a table occupied
 */
const ACTIVE_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
] as const;

/**
 * Check if a table should be marked as available based on its orders
 *
 * @param tableId - The ID of the table to check
 * @returns true if table should be available, false otherwise
 */
export async function shouldTableBeAvailable(
  tableId: string
): Promise<boolean> {
  try {
    // Count active orders for this table
    const activeOrderCount = await prisma.order.count({
      where: {
        tableId,
        OR: [
          // Case 1: Active order status (still finding/cooking/serving)
          {
            status: { in: ACTIVE_ORDER_STATUSES },
          },
          // Case 2: Served but NOT paid yet
          {
            status: 'served',
            paymentStatus: { not: 'completed' },
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
 * @returns Promise that resolves when update is complete
 */
export async function autoUpdateTableStatus(tableId: string): Promise<void> {
  try {
    // Get current table status
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: { status: true, tableNumber: true },
    });

    if (!table) {
      console.warn(`[TableStatusManager] Table ${tableId} not found`);
      return;
    }

    // Check if table should be available
    const shouldBeAvailable = await shouldTableBeAvailable(tableId);

    // Only update if status needs to change
    if (shouldBeAvailable && table.status === 'occupied') {
      await prisma.table.update({
        where: { id: tableId },
        data: {
          status: 'available',
          updatedAt: new Date(),
        },
      });

      console.log(
        `[TableStatusManager] Auto-cleared table ${table.tableNumber} (${tableId}) to available`
      );
    } else if (!shouldBeAvailable && table.status === 'available') {
      // Edge case: Table is available but has active orders
      // This shouldn't happen in normal flow, but we'll fix it
      await prisma.table.update({
        where: { id: tableId },
        data: {
          status: 'occupied',
          updatedAt: new Date(),
        },
      });

      console.log(
        `[TableStatusManager] Auto-set table ${table.tableNumber} (${tableId}) to occupied`
      );
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
          in: ['pending', 'confirmed', 'preparing'],
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
