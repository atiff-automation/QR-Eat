import { CartItem } from './menu';

export interface CustomerSession {
  id: string;
  tableId: string;
  sessionToken: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  startedAt: string;
  expiresAt: string;
  status: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  dailySeq?: number;
  restaurantId: string;
  tableId: string;
  customerSessionId: string;
  subtotalAmount: number;
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  specialInstructions?: string;
  estimatedReadyTime?: string;
  createdAt: string;
  confirmedAt?: string;
  readyAt?: string;
  servedAt?: string;
  table: {
    tableNumber: string;
    tableName?: string;
  };
  // Snapshot fields
  taxLabelSnapshot?: string;
  serviceChargeLabelSnapshot?: string;
  taxRateSnapshot?: string | number;
  serviceChargeRateSnapshot?: string | number;
  items: OrderItem[];
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  dailySeq?: number;
  status: string;
  paymentStatus: string;
  subtotalAmount: number;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
  estimatedReadyTime?: string;
  sessionToken: string;
  // Snapshot fields
  taxLabelSnapshot?: string;
  serviceChargeLabelSnapshot?: string;
  taxRateSnapshot?: string | number;
  serviceChargeRateSnapshot?: string | number;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  specialInstructions?: string;
  status: string;
  menuItem: {
    name: string;
    description?: string;
    preparationTime: number;
  };
  selectedOptions: OrderItemOption[];
}

export interface OrderItemOption {
  id: string;
  name: string;
  priceModifier: number;
}

export interface CreateOrderRequest {
  tableId: string;
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  items: CartItem[];
  specialInstructions?: string;
}

export interface OrderStatusUpdate {
  orderId: string;
  status: string;
  estimatedReadyTime?: string;
  notes?: string;
}
