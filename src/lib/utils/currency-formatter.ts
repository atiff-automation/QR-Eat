/**
 * Currency Formatting Utilities
 * Replaces hardcoded formatPrice() function with dynamic currency support
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
  AUD: 'A$',
  NZD: 'NZ$',
  CAD: 'C$',
  CHF: 'Fr',
  INR: '₹',
  KRW: '₩',
  TWD: 'NT$',
  HKD: 'HK$',
};

/**
 * Format currency using Intl.NumberFormat
 * This is the main function for displaying prices
 *
 * @param amount - The amount to format
 * @param currency - ISO 4217 currency code (e.g., 'MYR', 'USD')
 * @param locale - Locale for formatting (default: 'en-MY')
 * @returns Formatted currency string (e.g., "RM 12.50")
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
 *
 * @param currency - ISO 4217 currency code
 * @returns Currency symbol (e.g., 'RM' for MYR)
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Format currency with simple symbol + amount
 * Used for receipts where we need consistent spacing
 *
 * @param amount - The amount to format
 * @param currency - ISO 4217 currency code
 * @returns Simple formatted string (e.g., "RM 12.50")
 */
export function formatCurrencySimple(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol} ${amount.toFixed(2)}`;
}
