/**
 * Order Merge Utility
 *
 * Combines multiple orders from the same table into a single merged order
 * for payment processing. This is used when a table has multiple unpaid orders
 * and the staff wants to process payment for all orders at once.
 *
 * @see src/app/dashboard/tables/page.tsx - handleProcessPayment
 */

import type { OrderWithDetails, OrderItemWithDetails } from '@/types/pos';

/**
 * Merges multiple orders into a single combined order
 *
 * @param orders - Array of orders to merge (must have at least 1 order)
 * @returns A single merged order with combined items and totals
 *
 * @example
 * const orders = [order1, order2, order3];
 * const merged = mergeOrdersForPayment(orders);
 * // merged.totalAmount = sum of all order totals
 * // merged.items = all items from all orders
 */
export function mergeOrdersForPayment(
  orders: OrderWithDetails[]
): OrderWithDetails {
  if (orders.length === 0) {
    throw new Error('Cannot merge empty order array');
  }

  // If only one order, return it as-is
  if (orders.length === 1) {
    return orders[0];
  }

  const firstOrder = orders[0];

  // Combine all items from all orders
  const allItems: OrderItemWithDetails[] = orders.flatMap(
    (order) => order.items
  );

  // Calculate combined totals using numbers (avoid Prisma Decimal on client)
  const subtotalAmount = orders.reduce(
    (sum, order) => sum + Number(order.subtotalAmount),
    0
  );

  const taxAmount = orders.reduce(
    (sum, order) => sum + Number(order.taxAmount),
    0
  );

  const serviceCharge = orders.reduce(
    (sum, order) => sum + Number(order.serviceCharge),
    0
  );

  const totalAmount = orders.reduce(
    (sum, order) => sum + Number(order.totalAmount),
    0
  );

  // Create merged order number for tracking
  const orderNumbers = orders.map((o) => o.orderNumber).join(' + ');
  const mergedOrderNumber = `COMBINED-${orders.length}-ORDERS`;

  // Return merged order with combined data
  // Note: Values are calculated as numbers but will be compatible with Decimal type
  return {
    ...firstOrder, // Use first order as base
    orderNumber: mergedOrderNumber,
    items: allItems,
    subtotalAmount,
    taxAmount,
    serviceCharge,
    totalAmount,
    // Store original order numbers in metadata for tracking
    metadata: {
      originalOrders: orderNumbers,
      orderCount: orders.length,
      orderIds: orders.map((o) => o.id),
    },
  } as OrderWithDetails;
}

/**
 * Checks if an order is a merged order
 *
 * @param order - Order to check
 * @returns True if order is merged from multiple orders
 */
export function isMergedOrder(order: OrderWithDetails): boolean {
  return order.orderNumber.startsWith('COMBINED-');
}

/**
 * Gets the original order count from a merged order
 *
 * @param order - Merged order
 * @returns Number of original orders, or 1 if not merged
 */
export function getOriginalOrderCount(order: OrderWithDetails): number {
  if (!isMergedOrder(order)) {
    return 1;
  }

  const metadata = order.metadata as { orderCount?: number };
  return metadata?.orderCount || 1;
}
