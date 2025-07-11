import { CartItem } from '@/types/menu';

export function generateOrderNumber(): string {
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
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  CANCELLED: 'cancelled',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

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
