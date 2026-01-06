/**
 * Receipt Generation Utilities
 *
 * Updated to use restaurant settings for dynamic formatting
 *
 * @see implementation_plan_production_v3.md - Integration Fixes
 */

import type { ReceiptData } from '@/types/pos';
import { formatCurrencySimple } from '@/lib/utils/currency-formatter';
import { getDateFormatOptions } from '@/lib/utils/date-formatter';

/**
 * Restaurant settings interface for receipt formatting
 */
interface RestaurantSettings {
  currency: string;
  taxLabel: string;
  serviceChargeLabel: string;
  receiptSettings: {
    headerText: string;
    footerText: string;
    paperSize: string;
  };
  systemPreferences: {
    dateFormat: string;
    timeFormat: string;
  };
}

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
 * Now accepts restaurant settings for dynamic formatting
 */
export function formatReceiptData(
  data: ReceiptData,
  settings: RestaurantSettings
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

  // Custom header text
  if (settings.receiptSettings.headerText) {
    lines.push(
      settings.receiptSettings.headerText.padStart(
        24 + settings.receiptSettings.headerText.length / 2
      )
    );
    lines.push('');
  }

  // Receipt info
  lines.push(`Receipt #: ${receiptNumber}`);
  lines.push(`Order #: ${order.orderNumber}`);

  // Use system preferences for date formatting
  const dateFormatOptions = getDateFormatOptions(
    settings.systemPreferences.dateFormat,
    settings.systemPreferences.timeFormat
  );
  lines.push(
    `Date: ${new Date(order.createdAt).toLocaleString('en-MY', dateFormatOptions)}`
  );

  lines.push(`Table: ${order.table.tableName || order.table.tableNumber}`);
  lines.push(`Cashier: ${cashier.firstName} ${cashier.lastName}`);
  lines.push('-'.repeat(48));
  lines.push('');

  // Items - use restaurant currency
  order.items.forEach((item) => {
    const name = `${item.menuItem.name} x${item.quantity}`;
    const price = formatCurrencySimple(
      Number(item.totalAmount),
      settings.currency
    );
    lines.push(`${name.padEnd(36)}${price.padStart(12)}`);
  });
  lines.push('');
  lines.push('-'.repeat(48));

  // Totals - use restaurant currency and custom labels
  const subtotal = formatCurrencySimple(
    Number(order.subtotalAmount),
    settings.currency
  );
  lines.push(`Subtotal:${subtotal.padStart(39)}`);

  const tax = formatCurrencySimple(Number(order.taxAmount), settings.currency);
  lines.push(
    `${settings.taxLabel}:${tax.padStart(48 - settings.taxLabel.length - 1)}`
  );

  const serviceCharge = formatCurrencySimple(
    Number(order.serviceCharge),
    settings.currency
  );
  lines.push(
    `${settings.serviceChargeLabel}:${serviceCharge.padStart(48 - settings.serviceChargeLabel.length - 1)}`
  );

  lines.push('');
  const total = formatCurrencySimple(
    Number(order.totalAmount),
    settings.currency
  );
  lines.push(`TOTAL:${total.padStart(42)}`);
  lines.push('');

  // Payment details - use restaurant currency
  lines.push(`Payment Method: ${payment.paymentMethod.toUpperCase()}`);

  if (payment.cashReceived && payment.changeGiven) {
    const cashReceived = formatCurrencySimple(
      Number(payment.cashReceived),
      settings.currency
    );
    lines.push(`Cash Received:${cashReceived.padStart(34)}`);

    const changeGiven = formatCurrencySimple(
      Number(payment.changeGiven),
      settings.currency
    );
    lines.push(`Change Given:${changeGiven.padStart(35)}`);
  }

  lines.push('');
  lines.push('-'.repeat(48));
  lines.push('');

  // Custom footer text
  if (settings.receiptSettings.footerText) {
    lines.push(
      settings.receiptSettings.footerText.padStart(
        24 + settings.receiptSettings.footerText.length / 2
      )
    );
  } else {
    lines.push('Thank you for dining with us!'.padStart(36));
    lines.push('Please come again!'.padStart(33));
  }

  lines.push('');
  lines.push('='.repeat(48));

  return lines.join('\n');
}
