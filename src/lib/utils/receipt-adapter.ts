/**
 * Receipt Adapter
 *
 * Transforms various data sources into a unified ReceiptDisplayData format.
 *
 * Following CLAUDE.md principles:
 * - Single Responsibility
 * - Type Safety
 */

import type { ReceiptDisplayData } from '@/types/receipt';
import type { PublicReceiptData, ReceiptData } from '@/types/pos';

/**
 * Adapts public receipt data (DTO) to display format
 */
export function adaptPublicToDisplay(
  data: PublicReceiptData
): ReceiptDisplayData {
  return {
    receiptNumber: data.receiptNumber,
    restaurant: {
      name: data.restaurant.name,
      address: data.restaurant.address,
      phone: data.restaurant.phone,
      email: data.restaurant.email,
      taxLabel: data.restaurant.taxLabel || 'Tax',
      serviceChargeLabel:
        data.restaurant.serviceChargeLabel || 'Service Charge',
      currency: data.restaurant.currency,
    },
    order: {
      orderNumber: data.order.orderNumber,
      dailySeq: data.order.dailySeq,
      tableName: `${data.order.tableNumber}${
        data.order.tableName ? ` - ${data.order.tableName}` : ''
      }`,
      tableLocation: data.order.tableLocation,
      createdAt: new Date(data.order.createdAt),
      items: data.order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        totalAmount: Number(item.totalAmount),
      })),
      subtotalAmount: Number(data.order.subtotalAmount),
      taxAmount: Number(data.order.taxAmount),
      serviceCharge: Number(data.order.serviceCharge),
      totalAmount: Number(data.order.totalAmount),
    },
    payment: {
      method: data.payment.method,
      cashReceived: data.payment.cashReceived
        ? Number(data.payment.cashReceived)
        : undefined,
      changeGiven: data.payment.changeGiven
        ? Number(data.payment.changeGiven)
        : undefined,
    },
    cashier: {
      firstName: data.cashier.firstName,
      lastName: data.cashier.lastName,
    },
  };
}

/**
 * Adapts POS internal data to display format
 */
export function adaptPosToDisplay(data: ReceiptData): ReceiptDisplayData {
  const { receiptNumber, order, payment, restaurant, cashier } = data;

  return {
    receiptNumber: receiptNumber,
    restaurant: {
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone,
      email: restaurant.email,
      taxLabel: order.taxLabel || restaurant.taxLabel || 'Tax',
      serviceChargeLabel: restaurant.serviceChargeLabel || 'Service Charge',
      currency: restaurant.currency || 'MYR',
    },
    order: {
      orderNumber: order.orderNumber,
      dailySeq: order.dailySeq ?? undefined,
      tableName: `${order.table.tableNumber}${
        order.table.tableName ? ` - ${order.table.tableName}` : ''
      }`,
      tableLocation: order.table.locationDescription || undefined,
      createdAt: new Date(order.createdAt),
      items: order.items.map((item) => ({
        name: item.menuItem.name,
        quantity: item.quantity,
        totalAmount: Number(item.totalAmount),
      })),
      subtotalAmount: Number(order.subtotalAmount),
      taxAmount: Number(order.taxAmount),
      serviceCharge: Number(order.serviceCharge),
      totalAmount: Number(order.totalAmount),
    },
    payment: {
      method: payment.paymentMethod,
      cashReceived: payment.cashReceived
        ? Number(payment.cashReceived)
        : undefined,
      changeGiven: payment.changeGiven
        ? Number(payment.changeGiven)
        : undefined,
    },
    cashier: {
      firstName: cashier.firstName,
      lastName: cashier.lastName,
    },
  };
}
