/**
 * Table Status Manager
 *
 * Centralized utility for automatic table status management.
 * Handles auto-clearing table status when all orders are completed.
 */

import { prisma } from '@/lib/database';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { Prisma } from '@prisma/client';
import { closeDiningSession } from '@/lib/dining-session';

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

async function releaseTableIfComplete(
  tx: Prisma.TransactionClient,
  tableId: string
): Promise<boolean> {
  const table = await tx.table.findUnique({
    where: { id: tableId },
    select: { status: true },
  });
  if (table?.status !== 'OCCUPIED') return false;

  const active = await shouldTableBeAvailable(tableId, tx);
  if (!active) return false;

  const servedPaidCount = await tx.order.count({
    where: {
      tableId,
      status: 'SERVED',
      paymentStatus: 'PAID',
    },
  });
  if (servedPaidCount <= 0) return false;

  await closeDiningSession(tx, tableId);
  return true;
}

/**
 * Apply the ADR-009 table lifecycle.
 *
 * - Active orders keep an AVAILABLE table occupied.
 * - An OCCUPIED table is released only when every order is SERVED and PAID.
 * - A table with no orders is left to the orphan cleanup job.
 *
 * The release uses closeDiningSession so the open dining session is closed
 * atomically with the table status change.
 *
 * @param tableId - The ID of the table to update, or null for takeaway
 * @param tx - Optional transaction client for atomic operations
 * @returns Promise that resolves when update is complete
 */
export async function autoUpdateTableStatus(
  tableId: string | null,
  tx?: Prisma.TransactionClient
): Promise<void> {
  if (!tableId) return;

  const db = tx || prisma;

  try {
    const table = await db.table.findUnique({
      where: { id: tableId },
      select: { status: true, tableNumber: true, restaurantId: true },
    });

    if (!table) {
      console.warn(`[TableStatusManager] Table ${tableId} not found`);
      return;
    }

    if (table.status === 'AVAILABLE') {
      const shouldBeAvailable = await shouldTableBeAvailable(tableId, tx);
      if (!shouldBeAvailable) {
        // Edge case: Table is available but has active orders.
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

        await PostgresEventManager.publishTableStatusChange({
          tableId,
          restaurantId: table.restaurantId,
          previousStatus: table.status,
          newStatus: 'OCCUPIED',
          updatedBy: 'system',
          timestamp: Date.now(),
        });
      }
      return;
    }

    if (table.status !== 'OCCUPIED') return;

    const released = tx
      ? await releaseTableIfComplete(tx, tableId)
      : await prisma.$transaction((transaction) =>
          releaseTableIfComplete(transaction, tableId)
        );

    if (released) {
      console.log(
        `[TableStatusManager] Auto-released table ${table.tableNumber} (${tableId}): served and paid`
      );

      await PostgresEventManager.publishTableStatusChange({
        tableId,
        restaurantId: table.restaurantId,
        previousStatus: 'OCCUPIED',
        newStatus: 'AVAILABLE',
        updatedBy: 'system',
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    // A status update must never block the payment/order flow. The cleanup
    // job and explicit clear remain the recovery paths.
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
