// Simplified payment types for counter payment model
// Customers order via QR → Pay at counter (no digital gateway)

export type PaymentMethodType = 'cash' | 'card' | 'ewallet';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface Payment {
  id: string;
  orderId: string;
  paymentMethod: PaymentMethodType;
  amount: number;
  status: PaymentStatus;
  processedAt?: Date;
  processedBy?: string; // Staff ID who processed payment at counter
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentIntent {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethodId: string;
  reference: string;
  verifiedBy?: string; // Staff who verified payment
  verifiedAt?: Date;
  createdAt: Date;
  confirmedAt?: Date;
  metadata?: Record<string, unknown>;
}
