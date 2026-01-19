import { CartItem } from '@/types/menu';
import Decimal from 'decimal.js';

/**
 * Calculate order totals with strict "Round Floor" logic.
 *
 * Strategy: "Floor per Component"
 * 1. Subtotal = Sum of all item prices (exact).
 * 2. Tax = Floor(Subtotal * TaxRate)
 *    - We round DOWN to 2 decimal places to favor the customer/meet requirement.
 * 3. Service = Floor(Subtotal * ServiceRate)
 *    - We round DOWN to 2 decimal places.
 * 4. Total = Subtotal + Tax + Service
 *    - This ensures the receipt always adds up perfectly (Receipt Integrity).
 *
 * @param items Array of items with totalPrice
 * @param taxRate Decimal tax rate (e.g. 0.06 for 6%)
 * @param serviceChargeRate Decimal service rate (e.g. 0.10 for 10%)
 */
export function calculateOrderTotals(
  items: { totalPrice: number }[],
  taxRate: number,
  serviceChargeRate: number
) {
  // Use Decimal for all intermediate math to avoid floating point errors
  const subtotal = items.reduce(
    (sum, item) => sum.plus(new Decimal(item.totalPrice)),
    new Decimal(0)
  );

  // Round Logic: FLOOR to 2 decimal places (Truncate)
  const taxAmount = subtotal
    .times(taxRate)
    .toDecimalPlaces(2, Decimal.ROUND_FLOOR);
  const serviceCharge = subtotal
    .times(serviceChargeRate)
    .toDecimalPlaces(2, Decimal.ROUND_FLOOR);

  // Total is the simple sum of the rounded components
  const totalAmount = subtotal.plus(taxAmount).plus(serviceCharge);

  // Return numbers for compatibility with Prisma/Frontend
  return {
    subtotal: subtotal.toNumber(),
    taxAmount: taxAmount.toNumber(),
    serviceCharge: serviceCharge.toNumber(),
    totalAmount: totalAmount.toNumber(),
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
  CONFIRMED: ['PREPARING', 'READY', 'CANCELLED'],
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
        label: 'Ready',
        nextStatus: ORDER_STATUS.READY,
        color: 'green', // One-Touch: Jump directly to Ready
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
          categoryId: true,
        },
      },
      selectedOptions: {
        select: {
          id: true,
          name: true,
          priceModifier: true,
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
