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

import type { ReceiptData } from '@/types/pos';

/**
 * Generate unique receipt number
 * Format: RCP-YYYYMMDD-HHMMSS-RND
 */
export function generateReceiptNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = now.getTime().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `RCP-${dateStr}-${timeStr}-${random}`;
}

/**
 * Format receipt data for display/printing
 */
export function formatReceiptData(
  data: ReceiptData,
  currency: string = 'MYR'
): string {
  const { receiptNumber, order, payment, restaurant, cashier } = data;

  const lines: string[] = [];

  // Header
  lines.push('='.repeat(48));
  lines.push(
    restaurant.name.toUpperCase().padStart(24 + restaurant.name.length / 2)
  );
  lines.push(restaurant.address.padStart(24 + restaurant.address.length / 2));
  lines.push(
    `Tel: ${restaurant.phone}`.padStart(24 + restaurant.phone.length / 2)
  );
  if (restaurant.email) {
    lines.push(restaurant.email.padStart(24 + restaurant.email.length / 2));
  }
  lines.push('='.repeat(48));
  lines.push('');

  // Receipt info
  lines.push(`Receipt #: ${receiptNumber}`);
  lines.push(`Order #: ${order.orderNumber}`);
  lines.push(
    `Date: ${new Date(order.createdAt).toLocaleString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`
  );
  lines.push(`Table: ${order.table.tableName || order.table.tableNumber}`);
  lines.push(`Cashier: ${cashier.firstName} ${cashier.lastName}`);
  lines.push('-'.repeat(48));
  lines.push('');

  // Items
  order.items.forEach((item) => {
    const name = `${item.menuItem.name} x${item.quantity}`;
    const price = `${currency} ${Number(item.totalAmount).toFixed(2)}`;
    lines.push(`${name.padEnd(36)}${price.padStart(12)}`);
  });
  lines.push('');
  lines.push('-'.repeat(48));

  // Totals
  const subtotal = `${currency} ${Number(order.subtotalAmount).toFixed(2)}`;
  lines.push(`Subtotal:${subtotal.padStart(39)}`);

  const tax = `${currency} ${Number(order.taxAmount).toFixed(2)}`;
  lines.push(`Tax (6%):${tax.padStart(39)}`);

  const serviceCharge = `${currency} ${Number(order.serviceCharge).toFixed(2)}`;
  lines.push(`Service Charge (10%):${serviceCharge.padStart(27)}`);

  lines.push('');
  const total = `${currency} ${Number(order.totalAmount).toFixed(2)}`;
  lines.push(`TOTAL:${total.padStart(42)}`);
  lines.push('');

  // Payment details
  lines.push(`Payment Method: ${payment.paymentMethod.toUpperCase()}`);

  if (payment.cashReceived && payment.changeGiven) {
    const cashReceived = `${currency} ${Number(payment.cashReceived).toFixed(2)}`;
    lines.push(`Cash Received:${cashReceived.padStart(34)}`);

    const changeGiven = `${currency} ${Number(payment.changeGiven).toFixed(2)}`;
    lines.push(`Change Given:${changeGiven.padStart(35)}`);
  }

  lines.push('');
  lines.push('-'.repeat(48));
  lines.push('');
  lines.push('Thank you for dining with us!'.padStart(36));
  lines.push('Please come again!'.padStart(33));
  lines.push('');
  lines.push('='.repeat(48));

  return lines.join('\n');
}
