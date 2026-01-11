/**
 * Receipt Type Definitions
 *
 * Unified types for receipt display across POS and Public View.
 *
 * Following CLAUDE.md principles:
 * - Single Source of Truth
 * - Type Safety
 */

export interface ReceiptDisplayData {
  receiptNumber: string;
  restaurant: {
    name: string;
    address: string;
    phone: string;
    email?: string;
    taxLabel: string;
    serviceChargeLabel: string;
  };
  order: {
    orderNumber: string;
    tableName: string;
    tableLocation?: string;
    createdAt: Date;
    items: {
      name: string;
      quantity: number;
      totalAmount: number;
    }[];
    subtotalAmount: number;
    taxAmount: number;
    serviceCharge: number;
    totalAmount: number;
    dailySeq?: number;
  };
  payment: {
    method: string;
    cashReceived?: number;
    changeGiven?: number;
  };
  cashier: {
    firstName: string;
    lastName: string;
  };
}
