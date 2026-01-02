/**
 * Order Modification Utilities
 *
 * Helper functions for order modification operations including
 * permission checks, validation, and formatting.
 */

/**
 * Check if order can be modified based on status
 *
 * Orders can only be modified in pending, confirmed, or preparing states.
 * Once ready or served, modifications are blocked to prevent issues with
 * already-prepared food.
 */
export function canModifyOrder(status: string): boolean {
  return ['pending', 'confirmed', 'preparing'].includes(status.toLowerCase());
}

/**
 * Check if order can be cancelled based on status
 *
 * Orders can only be cancelled in pending or confirmed states.
 * Once preparing, ready, or served, cancellation is not allowed.
 */
export function canCancelOrder(status: string): boolean {
  return ['pending', 'confirmed'].includes(status.toLowerCase());
}

/**
 * Format modification reason for display
 *
 * Converts database enum values to user-friendly labels.
 */
export function formatModificationReason(reason: string): string {
  const reasons: Record<string, string> = {
    out_of_stock: 'Out of Stock',
    customer_request: 'Customer Request',
    kitchen_error: 'Kitchen Error',
    other: 'Other',
  };
  return reasons[reason] || reason;
}

/**
 * Calculate if refund is needed
 *
 * Returns the refund amount if:
 * - Order is already paid (payment status = completed)
 * - New total is less than original total
 *
 * Otherwise returns null (no refund needed).
 */
export function calculateRefundNeeded(
  order: { paymentStatus: string; totalAmount: number },
  newTotal: number
): number | null {
  if (order.paymentStatus !== 'completed') return null;
  if (newTotal >= order.totalAmount) return null;

  const refund = order.totalAmount - newTotal;
  return Math.round(refund * 100) / 100; // Round to 2 decimal places
}

/**
 * Generate idempotency key for modification
 *
 * Uses crypto.randomUUID() for secure, unique identifiers.
 * This prevents duplicate modifications from double-clicks or retries.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Get modification summary for display
 *
 * Creates a human-readable summary of what changed in a modification.
 * Example: "2 removed, 1 changed"
 */
export function getModificationSummary(modification: {
  items: Array<{
    action: string;
    menuItem: { name: string };
    oldQuantity?: number;
    newQuantity?: number;
  }>;
}): string {
  const { items } = modification;
  const removed = items.filter((i) => i.action === 'removed').length;
  const changed = items.filter((i) => i.action === 'quantity_changed').length;
  const added = items.filter((i) => i.action === 'added').length;

  const parts = [];
  if (removed > 0) parts.push(`${removed} removed`);
  if (changed > 0) parts.push(`${changed} changed`);
  if (added > 0) parts.push(`${added} added`);

  return parts.join(', ') || 'No changes';
}

/**
 * Validate modification item changes
 *
 * Ensures item changes are valid before processing.
 * Throws error if validation fails.
 */
export function validateItemChanges(
  itemChanges: Array<{
    itemId: string;
    action: string;
    newQuantity?: number;
  }>
): void {
  if (itemChanges.length === 0) {
    throw new Error('At least one item change is required');
  }

  for (const change of itemChanges) {
    if (change.action === 'update_quantity' && !change.newQuantity) {
      throw new Error('newQuantity is required for update_quantity action');
    }

    if (change.action === 'update_quantity' && change.newQuantity! < 1) {
      throw new Error('newQuantity must be at least 1');
    }

    if (change.action === 'update_quantity' && change.newQuantity! > 99) {
      throw new Error('newQuantity cannot exceed 99');
    }
  }
}

/**
 * Format timestamp for modification history
 */
export function formatModificationTime(timestamp: string | Date): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
