import { Order } from '@prisma/client';
import { ORDER_STATUS } from './order-utils';

/**
 * Check if user can modify order based on status and role
 * 
 * @param order - The order to check
 * @param userType - High-level user type (platform_admin, restaurant_owner, staff)
 * @param roleTemplate - Specific role template (manager, waiter, kitchen, cashier) - only for staff
 * @param operation - The operation being attempted
 */
export function canModifyOrder(
  order: Order,
  userType: string,
  roleTemplate: string | null | undefined,
  operation: 'add' | 'remove' | 'cancel' | 'modify_qty'
): { allowed: boolean; reason?: string } {
  // PENDING: Anyone can modify
  if (order.status === ORDER_STATUS.PENDING) {
    return { allowed: true };
  }

  // Platform admin always has permission
  if (userType === 'platform_admin') {
    return { allowed: true };
  }

  // Restaurant owner always has permission
  if (userType === 'restaurant_owner') {
    // Check for add operation restriction - cannot add to in-progress orders
    const inProgressStatuses = ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'] as const;
    if (operation === 'add' && inProgressStatuses.includes(order.status as typeof inProgressStatuses[number])) {
      return {
        allowed: false,
        reason:
          'Cannot add items to order in progress. Please create a new order instead.',
      };
    }
    return { allowed: true };
  }

  // Staff: Check roleTemplate
  if (userType === 'staff') {
    // Only manager can modify confirmed orders
    if (roleTemplate === 'manager') {
      // Manager can do everything except add items to in-progress orders
      const inProgressStatuses = ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'] as const;
      if (operation === 'add' && inProgressStatuses.includes(order.status as typeof inProgressStatuses[number])) {
        return {
          allowed: false,
          reason:
            'Cannot add items to order in progress. Please create a new order instead.',
        };
      }
      return { allowed: true };
    }

    // All other staff roles cannot modify confirmed orders
    return {
      allowed: false,
      reason:
        'Only restaurant admin or manager can modify orders after they are sent to kitchen.',
    };
  }

  // Default deny
  return {
    allowed: false,
    reason: 'Insufficient permissions to modify order.',
  };
}

/**
 * Get user-friendly message about modification permissions
 */
export function getModificationMessage(
  order: Order,
  userType: string,
  roleTemplate: string | null | undefined
): string {
  if (order.status === ORDER_STATUS.PENDING) {
    return 'You can modify this order.';
  }

  if (userType === 'platform_admin' || userType === 'restaurant_owner') {
    return 'You can modify this order, but cannot add new items.';
  }

  if (userType === 'staff' && roleTemplate === 'manager') {
    return 'As a manager, you can modify this order, but cannot add new items.';
  }

  return 'Only restaurant admin or manager can modify orders after they are sent to kitchen.';
}
