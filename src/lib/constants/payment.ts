/**
 * Payment Constants - Single Source of Truth
 *
 * Following CLAUDE.md principles:
 * - Single Source of Truth (SSOT)
 * - No Hardcoding
 * - Type Safety
 *
 * @see claudedocs/CODING_STANDARDS.md
 */

// ============================================================================
// Payment Methods (POS System)
// ============================================================================

export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  EWALLET: 'ewallet',
} as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [PAYMENT_METHODS.CASH]: 'Cash',
  [PAYMENT_METHODS.CARD]: 'Card',
  [PAYMENT_METHODS.EWALLET]: 'E-Wallet',
};

export const PAYMENT_METHOD_ICONS: Record<string, string> = {
  [PAYMENT_METHODS.CASH]: 'Banknote',
  [PAYMENT_METHODS.CARD]: 'CreditCard',
  [PAYMENT_METHODS.EWALLET]: 'Smartphone',
};

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  [PAYMENT_METHODS.CASH]:
    'bg-green-50 hover:bg-green-100 border-green-300 text-green-600',
  [PAYMENT_METHODS.CARD]:
    'bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-600',
  [PAYMENT_METHODS.EWALLET]:
    'bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-600',
};

// ============================================================================
// Payment Status (Re-export from order-utils for consistency)
// ============================================================================

export { PAYMENT_STATUS } from '@/lib/order-utils';

// ============================================================================
// Type Definitions
// ============================================================================

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];
