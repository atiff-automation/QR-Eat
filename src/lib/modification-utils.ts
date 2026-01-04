import { Order } from '@prisma/client';
import { ORDER_STATUS } from './order-utils';

/**
 * Check if user can modify order based on status and role
 */
export function canModifyOrder(
  order: Order,
  userRole: string,
  operation: 'add' | 'remove' | 'cancel' | 'modify_qty'
): { allowed: boolean; reason?: string } {
  // PENDING: Anyone can modify
  if (order.status === ORDER_STATUS.PENDING) {
    return { allowed: true };
  }

  // CONFIRMED onwards: Manager/Admin only
  const isManagerOrAdmin = ['restaurant_owner', 'manager'].includes(userRole);

  if (!isManagerOrAdmin) {
    return {
      allowed: false,
      reason:
        'Only restaurant admin or manager can modify orders after they are sent to kitchen.',
    };
  }

  // Manager/Admin can do everything except add items to in-progress orders
  if (operation === 'add' && order.status !== ORDER_STATUS.PENDING) {
    return {
      allowed: false,
      reason:
        'Cannot add items to order in progress. Please create a new order instead.',
    };
  }

  // All other operations allowed for manager/admin
  return { allowed: true };
}

/**
 * Get modification permission message
 */
export function getModificationMessage(order: Order, userRole: string): string {
  if (order.status === ORDER_STATUS.PENDING) {
    return 'Order can be modified freely (not yet sent to kitchen).';
  }

  const isManagerOrAdmin = ['restaurant_owner', 'manager'].includes(userRole);

  if (!isManagerOrAdmin) {
    return 'Order has been sent to kitchen. Only manager or admin can make changes.';
  }

  return 'Manager approval: Order is in kitchen. Verify with chef before making changes.';
}
