import { Order } from '@prisma/client';
import { ORDER_STATUS } from './order-utils';

/**
 * Calculate refund amount (always full refund for paid orders)
 */
export function calculateRefundAmount(order: Order): number {
  if (order.paymentStatus !== 'PAID') {
    return 0;
  }

  // Always full refund
  return Number(order.totalAmount);
}

/**
 * Check if user has permission to cancel paid order
 */
export function canCancelPaidOrder(userRole: string): boolean {
  // Only admin or manager can cancel paid orders
  return ['restaurant_owner', 'manager'].includes(userRole);
}

/**
 * Determine if cancellation is allowed
 */
export function canCancelOrder(
  order: Order,
  userRole: string
): { allowed: boolean; reason?: string } {
  // Cannot cancel already cancelled orders
  if (order.status === ORDER_STATUS.CANCELLED) {
    return { allowed: false, reason: 'Order is already cancelled' };
  }

  // If paid, check permission
  if (order.paymentStatus === 'PAID') {
    if (!canCancelPaidOrder(userRole)) {
      return {
        allowed: false,
        reason: 'Only restaurant admin or manager can cancel paid orders.',
      };
    }
  }

  return { allowed: true };
}

/**
 * Get refund message for customer
 */
export function getRefundMessage(order: Order): string {
  if (order.paymentStatus === 'PAID') {
    return `Full refund of $${Number(order.totalAmount).toFixed(2)} will be processed and will appear in your account within 3-5 business days.`;
  }
  return 'Order cancelled successfully.';
}
