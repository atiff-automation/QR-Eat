/**
 * Table Status Utilities
 * Centralized logic for table status checks and messages
 */

/**
 * Check if a table status allows ordering
 */
export function canTableAcceptOrders(status: string): boolean {
  return status !== 'RESERVED' && status !== 'INACTIVE';
}

/**
 * Check if a table status allows modal opening in staff dashboard
 * INACTIVE tables should not open modal
 * RESERVED tables CAN open modal (to show check-in button)
 */
export function canOpenTableModal(status: string): boolean {
  return status !== 'INACTIVE';
}

/**
 * Get customer-facing message for unavailable table
 */
export function getTableUnavailableMessage(status: string): {
  title: string;
  message: string;
  icon: 'lock' | 'x-circle';
  color: 'blue' | 'gray';
} {
  if (status === 'RESERVED') {
    return {
      title: 'Table Reserved',
      message:
        'This table is currently reserved. Please contact a staff member to check you in.',
      icon: 'lock',
      color: 'blue',
    };
  }

  if (status === 'INACTIVE') {
    return {
      title: 'Table Unavailable',
      message:
        'This table is currently unavailable. Please contact a staff member for assistance.',
      icon: 'x-circle',
      color: 'gray',
    };
  }

  // Fallback (should never happen)
  return {
    title: 'Table Unavailable',
    message: 'This table cannot accept orders at this time.',
    icon: 'x-circle',
    color: 'gray',
  };
}

/**
 * Get staff-facing message for blocked modal
 */
export function getStaffModalBlockMessage(status: string): string {
  if (status === 'INACTIVE') {
    return 'This table is inactive. Please activate it first to view details or make orders.';
  }
  return 'This table is not available.';
}
