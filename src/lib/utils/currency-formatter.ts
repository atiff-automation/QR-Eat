/**
 * Currency Formatting Utilities
 * Replaces hardcoded formatPrice() function
 *
 * @see implementation_plan_production_v3.md - Integration Utilities
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  MYR: 'RM',
  USD: '$',
  SGD: 'S$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  THB: '฿',
  IDR: 'Rp',
  PHP: '₱',
};

/**
 * Format currency using Intl.NumberFormat
 * This is the main function to use throughout the application
 */
export function formatCurrency(
  amount: number | string,
  currency: string = 'MYR',
  locale: string = 'en-MY'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(numAmount);
}

/**
 * Get currency symbol for a given currency code
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Format currency with simple symbol + amount
 * Used for receipt formatting where space is limited
 */
export function formatCurrencySimple(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol} ${amount.toFixed(2)}`;
}
