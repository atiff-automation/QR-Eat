'use client';

import { getOrderStatusDisplay } from '@/lib/order-utils';

export interface StatusBadgeProps {
  /** Order status value */
  status: string;
  /** Size variant of the badge */
  size?: 'sm' | 'md' | 'lg';
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * StatusBadge - Reusable order status badge component
 *
 * Displays order status with consistent color coding and styling.
 * Uses the centralized status display logic from order-utils.
 *
 * @example
 * ```tsx
 * <StatusBadge status="pending" size="md" />
 * <StatusBadge status="preparing" size="lg" />
 * ```
 */
export function StatusBadge({
  status,
  size = 'md',
  className = '',
}: StatusBadgeProps) {
  const statusDisplay = getOrderStatusDisplay(status);

  // Size-specific classes
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${statusDisplay.color} ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label={`Order status: ${statusDisplay.label}`}
    >
      {statusDisplay.label}
    </span>
  );
}
