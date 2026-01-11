import { CartItem } from '@/types/menu';

/**
 * Generate a random order number
 * @deprecated Use SequenceManager.getNextOrder() instead
 */
export function generateOrderNumber(): string {
  console.warn('Using deprecated generateOrderNumber()');
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `ORD-${timestamp}-${random}`;
}

export function calculateOrderTotals(
  items: CartItem[],
  taxRate: number,
  serviceChargeRate: number
) {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = subtotal * taxRate;
  const serviceCharge = subtotal * serviceChargeRate;
  const totalAmount = subtotal + taxAmount + serviceCharge;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    serviceCharge: Math.round(serviceCharge * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

export function estimateReadyTime(items: CartItem[]): Date {
  // Calculate estimated preparation time based on items
  const maxPrepTime = Math.max(
    ...items.map((item) => item.menuItem.preparationTime)
  );
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  // Base time plus additional time for quantity
  const estimatedMinutes = maxPrepTime + Math.floor(totalItems / 3) * 2;

  const readyTime = new Date();
  readyTime.setMinutes(readyTime.getMinutes() + estimatedMinutes);

  return readyTime;
}

export const ORDER_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;

// State transition validation
export const VALID_ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

export function validateOrderTransition(from: string, to: string): boolean {
  return VALID_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getInvalidTransitionMessage(from: string, to: string): string {
  const validTransitions =
    VALID_ORDER_TRANSITIONS[from]?.join(', ') || 'none (terminal state)';
  return `Invalid status transition: ${from} → ${to}. Valid transitions from ${from}: ${validTransitions}`;
}

export function getOrderStatusDisplay(status: string): {
  label: string;
  color: string;
} {
  switch (status) {
    case ORDER_STATUS.PENDING:
      return {
        label: 'Pending Confirmation',
        color: 'text-yellow-600 bg-yellow-100',
      };
    case ORDER_STATUS.CONFIRMED:
      return { label: 'Confirmed', color: 'text-blue-600 bg-blue-100' };
    case ORDER_STATUS.PREPARING:
      return { label: 'Preparing', color: 'text-orange-600 bg-orange-100' };
    case ORDER_STATUS.READY:
      return {
        label: 'Ready for Pickup',
        color: 'text-green-600 bg-green-100',
      };
    case ORDER_STATUS.SERVED:
      return { label: 'Served', color: 'text-gray-600 bg-gray-100' };
    case ORDER_STATUS.CANCELLED:
      return { label: 'Cancelled', color: 'text-red-600 bg-red-100' };
    default:
      return { label: status, color: 'text-gray-600 bg-gray-100' };
  }
}

/**
 * Get the next action button configuration for an order based on its current status
 *
 * @param status - Current order status
 * @returns Action button config or null if no action available
 *
 * @example
 * ```ts
 * const action = getNextOrderAction('pending');
 * // { label: 'Confirm', nextStatus: 'confirmed', color: 'orange' }
 * ```
 */
export function getNextOrderAction(status: string): {
  label: string;
  nextStatus: string;
  color: string;
} | null {
  switch (status) {
    case ORDER_STATUS.PENDING:
      return {
        label: 'Confirm',
        nextStatus: ORDER_STATUS.CONFIRMED,
        color: 'orange', // Urgent - matches orange border
      };
    case ORDER_STATUS.CONFIRMED:
      return {
        label: 'Start',
        nextStatus: ORDER_STATUS.PREPARING,
        color: 'blue', // Acknowledged - matches blue border
      };
    case ORDER_STATUS.PREPARING:
      return {
        label: 'Ready',
        nextStatus: ORDER_STATUS.READY,
        color: 'green', // Complete - matches green when ready
      };
    case ORDER_STATUS.READY:
      return {
        label: 'Serve',
        nextStatus: ORDER_STATUS.SERVED,
        color: 'gray', // Final step
      };
    default:
      return null;
  }
}

/**
 * Get a formatted summary of order items
 *
 * @param items - Array of order items
 * @returns Formatted string like "3 items" or "1 item"
 *
 * @example
 * ```ts
 * getOrderSummary(order.items) // "3 items"
 * ```
 */
export function getOrderSummary(items: Array<{ quantity: number }>): string {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  return `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
}

/**
 * Get elapsed time since order creation
 *
 * @param createdAt - Order creation timestamp
 * @returns Formatted elapsed time string
 *
 * @example
 * ```ts
 * getElapsedTime('2024-01-01T12:00:00Z') // "3 mins"
 * ```
 */
export function getElapsedTime(createdAt: string): string {
  const now = new Date().getTime();
  const created = new Date(createdAt).getTime();
  const diffMs = now - created;
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 min';
  return `${minutes} mins`;
}

/**
 * Standard Prisma include object for fetching orders with full details.
 * Ensures consistent field availability (e.g. locationDescription) across all views.
 *
 * Use this in prisma.order.findMany/findUnique({ include: ORDER_WITH_DETAILS_INCLUDE })
 */
export const ORDER_WITH_DETAILS_INCLUDE = {
  table: {
    select: {
      id: true,
      tableNumber: true,
      tableName: true,
      locationDescription: true,
    },
  },
  customerSession: {
    select: {
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      sessionToken: true,
    },
  },
  items: {
    include: {
      menuItem: {
        select: {
          name: true,
          price: true,
          preparationTime: true,
        },
      },
      variations: {
        include: {
          variation: {
            select: {
              name: true,
              priceModifier: true,
              variationType: true,
            },
          },
        },
      },
    },
  },
  restaurant: {
    select: {
      id: true,
      name: true,
      taxLabel: true,
      serviceChargeLabel: true,
      address: true,
      phone: true,
      email: true,
    },
  },
} as const;
