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
  items: OrderItem[];
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
  variations: OrderItemVariation[];
}

export interface OrderItemVariation {
  id: string;
  variationId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  variation: {
    name: string;
    variationType: string;
  };
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

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  estimatedReadyTime?: string;
  sessionToken: string;
}
