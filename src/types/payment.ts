export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  name: string;
  description?: string;
  enabled: boolean;
  config?: {
    merchantId?: string;
    apiKey?: string;
    webhookUrl?: string;
  };
}

export type PaymentMethodType = 
  | 'cash'
  | 'card'
  | 'digital_wallet'
  | 'bank_transfer'
  | 'stripe'
  | 'paypal'
  | 'apple_pay'
  | 'google_pay';

export interface PaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  returnUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentMethodType: PaymentMethodType;
  transactionId?: string;
  providerResponse?: any;
  redirectUrl?: string;
  message?: string;
}

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface PaymentIntent {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethodId: string;
  clientSecret?: string;
  createdAt: string;
  confirmedAt?: string;
  metadata?: Record<string, any>;
}

export interface RefundRequest {
  paymentId: string;
  amount?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface RefundResponse {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  amount: number;
  currency: string;
  reason?: string;
  message?: string;
}

export interface PaymentConfig {
  currency: string;
  enabledMethods: PaymentMethodType[];
  stripePublishableKey?: string;
  paypalClientId?: string;
  minimumAmount: number;
  maximumAmount: number;
  allowTips: boolean;
  tipSuggestions: number[];
}