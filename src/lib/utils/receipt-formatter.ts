/**
 * Receipt Generation Utilities
 *
 * Following CLAUDE.md principles:
 * - Single Responsibility
 * - No Hardcoding
 * - Type Safety
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

/**
 * Generate unique receipt number
 * Format: RCP-YYYYMMDD-HHMMSS-RND
 */
/**
 * Generate unique receipt number
 * Format: RCP-YYYYMMDD-HHMMSS-RND
 * @deprecated Use SequenceManager.getNextReceipt() instead
 */
export function generateReceiptNumber(): string {
  console.warn('Using deprecated generateReceiptNumber()');
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = now.getTime().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `RCP-${dateStr}-${timeStr}-${random}`;
}
