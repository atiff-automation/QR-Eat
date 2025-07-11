import { PaymentMethodType, PaymentStatus } from '@/types/payment';

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function getPaymentMethodIcon(type: PaymentMethodType): string {
  switch (type) {
    case 'cash':
      return '💵';
    case 'card':
      return '💳';
    case 'digital_wallet':
      return '📱';
    case 'bank_transfer':
      return '🏦';
    case 'stripe':
      return '💳';
    case 'paypal':
      return '🅿️';
    case 'apple_pay':
      return '🍎';
    case 'google_pay':
      return '🅶';
    default:
      return '💳';
  }
}

export function getPaymentMethodName(type: PaymentMethodType): string {
  switch (type) {
    case 'cash':
      return 'Cash';
    case 'card':
      return 'Credit/Debit Card';
    case 'digital_wallet':
      return 'Digital Wallet';
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'stripe':
      return 'Card Payment';
    case 'paypal':
      return 'PayPal';
    case 'apple_pay':
      return 'Apple Pay';
    case 'google_pay':
      return 'Google Pay';
    default:
      return 'Unknown';
  }
}

export function getPaymentStatusDisplay(status: PaymentStatus): {
  label: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        color: 'text-yellow-600 bg-yellow-100',
        icon: '⏳'
      };
    case 'processing':
      return {
        label: 'Processing',
        color: 'text-blue-600 bg-blue-100',
        icon: '⚡'
      };
    case 'requires_action':
      return {
        label: 'Action Required',
        color: 'text-orange-600 bg-orange-100',
        icon: '⚠️'
      };
    case 'succeeded':
      return {
        label: 'Paid',
        color: 'text-green-600 bg-green-100',
        icon: '✅'
      };
    case 'failed':
      return {
        label: 'Failed',
        color: 'text-red-600 bg-red-100',
        icon: '❌'
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        color: 'text-gray-600 bg-gray-100',
        icon: '🚫'
      };
    case 'refunded':
      return {
        label: 'Refunded',
        color: 'text-purple-600 bg-purple-100',
        icon: '💰'
      };
    default:
      return {
        label: status,
        color: 'text-gray-600 bg-gray-100',
        icon: '❓'
      };
  }
}

export function calculateTipAmount(subtotal: number, tipPercentage: number): number {
  return Math.round(subtotal * (tipPercentage / 100) * 100) / 100;
}

export function validatePaymentAmount(
  amount: number,
  minAmount: number = 0.5,
  maxAmount: number = 10000
): { valid: boolean; error?: string } {
  if (amount < minAmount) {
    return {
      valid: false,
      error: `Minimum payment amount is ${formatCurrency(minAmount)}`
    };
  }

  if (amount > maxAmount) {
    return {
      valid: false,
      error: `Maximum payment amount is ${formatCurrency(maxAmount)}`
    };
  }

  return { valid: true };
}

export function generatePaymentReference(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PAY-${timestamp}-${random}`;
}

export const DEFAULT_TIP_SUGGESTIONS = [10, 15, 18, 20, 25];

export const PAYMENT_PROVIDERS = {
  STRIPE: 'stripe',
  PAYPAL: 'paypal',
  CASH: 'cash',
} as const;