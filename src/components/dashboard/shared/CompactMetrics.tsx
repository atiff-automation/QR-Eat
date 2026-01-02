'use client';

import { ReactNode } from 'react';

/**
 * Represents a single metric item in the compact display
 */
export interface MetricItem {
  /** Display label for the metric */
  label: string;
  /** Value to display (number or formatted string) */
  value: string | number;
  /** Optional icon to display before the value */
  icon?: ReactNode;
  /** Optional ARIA label for accessibility */
  ariaLabel?: string;
}

export interface CompactMetricsProps {
  /** Array of metrics to display */
  metrics: MetricItem[];
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * CompactMetrics - Minimal single-line metrics display
 *
 * Displays multiple metrics in a compact, space-efficient format with
 * separator dots between items. Optimized for mobile-first design.
 *
 * @example
 * ```tsx
 * <CompactMetrics
 *   metrics={[
 *     { label: 'orders', value: 24 },
 *     { label: 'pending', value: 5 },
 *     { label: 'revenue', value: '$1,234.56' }
 *   ]}
 * />
 * ```
 */
export function CompactMetrics({
  metrics,
  className = '',
}: CompactMetricsProps) {
  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 ${className}`}
      role="region"
      aria-label="Order metrics summary"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:text-base">
        {metrics.map((metric, index) => (
          <div key={index} className="flex items-center gap-1.5">
            {/* Icon (if provided) */}
            {metric.icon && (
              <span className="flex-shrink-0 text-gray-500" aria-hidden="true">
                {metric.icon}
              </span>
            )}

            {/* Metric Value and Label */}
            <span
              className="font-semibold text-gray-900"
              aria-label={metric.ariaLabel || `${metric.value} ${metric.label}`}
            >
              {metric.value}
            </span>
            <span className="text-gray-600">{metric.label}</span>

            {/* Separator Dot (not after last item) */}
            {index < metrics.length - 1 && (
              <span className="text-gray-400 ml-1" aria-hidden="true">
                •
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
