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
  table: Pick<Table, 'tableNumber' | 'tableName'>;
  customerSession: {
    customerName: string | null;
    customerPhone: string | null;
  } | null;
  items: OrderItemWithDetails[];
}

export interface OrderItemWithDetails {
  id: string;
  quantity: number;
  unitPrice: Decimal;
  totalAmount: Decimal;
  specialInstructions: string | null;
  menuItem: Pick<MenuItem, 'name' | 'price' | 'preparationTime'>;
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
  };
  cashier: {
    firstName: string;
    lastName: string;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PendingOrdersResponse {
  success: boolean;
  orders: OrderWithDetails[];
  total: number;
  hasMore: boolean;
}

export interface PaymentResponse {
  success: boolean;
  payment: Payment;
  order: Pick<Order, 'id' | 'paymentStatus' | 'updatedAt'>;
  message: string;
}

// NEW: Table Orders Response
export interface TableOrdersResponse {
  success: boolean;
  orders: OrderWithDetails[];
  tableTotal: number;
  paidTotal: number;
  tableId: string;
  tableNumber: string;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface PendingOrderCardProps {
  order: OrderWithDetails;
  onClick: () => void;
}

export interface PaymentInterfaceProps {
  order: OrderWithDetails;
  onClose: () => void;
  onPaymentComplete: () => void;
}

export interface PaymentMethodSelectorProps {
  onSelect: (method: PaymentMethod) => void;
}

export interface CashPaymentFormProps {
  totalAmount: number;
  onSubmit: (data: { cashReceived: number }) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export interface ReceiptProps {
  order: OrderWithDetails;
  payment: Payment;
  onClose: () => void;
}

export interface OrderDetailsProps {
  order: OrderWithDetails;
}

// NEW: Table Orders List Props
export interface TableOrdersListProps {
  orders: OrderWithDetails[];
  tableTotal: number;
  onProcessPayment: () => void;
  isLoading: boolean;
}
