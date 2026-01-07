/**
 * Formatting Utilities
 *
 * Following CLAUDE.md principles:
 * - Single Responsibility
 * - Type Safety
 * - No Hardcoding
 *
 * @see claudedocs/CODING_STANDARDS.md
 */

/**
 * Format currency amount
 * @deprecated Use formatPrice from '@/lib/qr-utils' instead
 * This is kept for backward compatibility and re-exports formatPrice
 */
import { formatPrice } from '@/lib/qr-utils';

export const formatCurrency = formatPrice;

/**
 * Format relative time (e.g., "5 minutes ago", "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
}

/**
 * Format date to readable string
 */
export function formatDate(date: Date | string, includeTime = true): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return dateObj.toLocaleString('en-MY', options);
}
