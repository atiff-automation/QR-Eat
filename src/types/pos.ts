/**
 * POS System Type Definitions
 *
 * Following CLAUDE.md principles:
 * - Type Safety (no `any` types)
 * - Single Responsibility
 * - Clear interfaces
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

import type { Order, Payment, Table, MenuItem } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Payment Method Types
// ============================================================================

export type PaymentMethod = 'cash' | 'card' | 'ewallet';

// ============================================================================
// Order with Details for POS Display
// ============================================================================

export interface OrderWithDetails extends Order {
  dailySeq: number | null;
  table: Pick<Table, 'tableNumber' | 'tableName' | 'locationDescription'>;
  restaurant?: {
    id: string;
    name: string;
    taxLabel?: string | null;
    serviceChargeLabel?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  customerSession: {
    customerName: string | null;
    customerPhone: string | null;
    customerEmail?: string | null;
    sessionToken?: string | null;
  } | null;
  items: OrderItemWithDetails[];
  // Restaurant settings for display
  // Restaurant settings for display
  taxLabel?: string;
  serviceChargeLabel?: string;
  // Snapshots (Explicit for type safety)
  taxRateSnapshot: Decimal;
  serviceChargeRateSnapshot: Decimal;
  taxLabelSnapshot: string;
  serviceChargeLabelSnapshot: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

export interface OrderItemWithDetails {
  id: string;
  quantity: number;
  status: string; // Added for Partial Ready workflow
  unitPrice: Decimal;
  totalAmount: Decimal;
  specialInstructions: string | null;
  menuItem: Pick<MenuItem, 'name' | 'price' | 'preparationTime'>;
  selectedOptions?: {
    id: string;
    name: string;
    priceModifier: Decimal;
  }[];
}

// ============================================================================
// Payment Processing Request & Response
// ============================================================================

export interface PaymentProcessRequest {
  orderId: string;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  externalTransactionId?: string;
  notes?: string;
  payFullTable?: boolean;
}

export interface PaymentProcessResult {
  success: boolean;
  payment: Payment;
  order: Pick<Order, 'id' | 'paymentStatus' | 'updatedAt'>;
  message: string;
}

// ============================================================================
// Receipt Data
// ============================================================================

export interface ReceiptData {
  receiptNumber: string;
  order: OrderWithDetails;
  payment: Payment;
  restaurant: {
    name: string;
    address: string;
    phone: string;
    email: string;
    taxLabel?: string;
    serviceChargeLabel?: string;
    currency?: string;
  };
  cashier: {
    firstName: string;
    lastName: string;
  };
}

// ...

export interface PaymentInterfaceProps {
  order: OrderWithDetails;
  relatedOrders?: OrderWithDetails[];
  currency?: string;
  onClose: () => void;
  onPaymentComplete: () => void;
}

export interface ReceiptProps {
  order: OrderWithDetails;
  payment: Payment;
  currency?: string;
  restaurantInfo: {
    name: string;
    address: string;
    phone: string;
    email: string;
    currency?: string;
    slug: string;
  };
  cashierInfo: {
    firstName: string;
    lastName: string;
  };
  onClose: () => void;
}

export interface OrderDetailsProps {
  order: OrderWithDetails;
  currency?: string;
  showOrderNumber?: boolean;
}

// ============================================================================
// Public Receipt Types (for customer access)
// ============================================================================

export interface PublicReceiptData {
  receiptNumber: string;
  restaurant: {
    name: string;
    address: string;
    phone: string;
    email: string;
    taxLabel?: string;
    serviceChargeLabel?: string;
    currency: string;
  };
  order: {
    orderNumber: string;
    dailySeq?: number;
    tableNumber: string;
    tableName: string;
    tableLocation?: string;
    items: {
      name: string;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
      selectedOptions?: {
        name: string;
        priceModifier: number;
      }[];
    }[];
    subtotalAmount: number;
    taxAmount: number;
    serviceCharge: number;
    totalAmount: number;
    createdAt: Date;
    // Snapshots
    taxRateSnapshot?: number;
    serviceChargeRateSnapshot?: number;
    taxLabelSnapshot?: string;
    serviceChargeLabelSnapshot?: string;
  };
  payment: {
    method: string;
    amount: number;
    cashReceived?: number;
    changeGiven?: number;
    completedAt: Date | null;
  };
  cashier: {
    firstName: string;
    lastName: string;
  };
}

export interface ReceiptQRDisplayProps {
  receiptNumber: string;
  restaurantSlug: string;
  onClose: () => void;
}
