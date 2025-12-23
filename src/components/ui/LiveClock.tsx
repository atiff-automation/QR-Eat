/**
 * Live Clock Component - Single Source of Truth
 *
 * Unified clock component used across the entire application.
 * Follows CLAUDE.md principles:
 * - Single Source of Truth
 * - Performance Optimization
 * - Local Timezone (browser default)
 *
 * Performance Optimization:
 * - Only re-renders when displayed value ACTUALLY changes
 * - For HH:MM format: updates every 60 seconds (not every 1 second)
 * - For HH:MM:SS format: updates every 1 second (but only if value changed)
 * - Uses React.memo to prevent parent re-renders
 *
 * @see claudedocs/CODING_STANDARDS.md - Single Source of Truth
 */

'use client';

import { useState, useEffect, memo, useCallback } from 'react';

/**
 * Clock Update Intervals (milliseconds)
 * Controls how frequently the clock component updates its display
 */
const UPDATE_INTERVAL_MS = {
  /** Update every second when showing seconds (HH:MM:SS) */
  WITH_SECONDS: 1000,
  /** Update every minute when not showing seconds (HH:MM) */
  WITHOUT_SECONDS: 60000,
} as const;

/**
 * Default Date Format Options
 * Used when no custom dateFormat is provided
 */
const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
} as const;

/**
 * Default Time Format Options (without seconds)
 * Used when no custom timeFormat is provided
 */
const DEFAULT_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
} as const;

interface LiveClockProps {
  /**
   * Show seconds in the time display
   * @default false (shows HH:MM only)
   */
  showSeconds?: boolean;

  /**
   * Show date along with time
   * @default false (time only)
   */
  showDate?: boolean;

  /**
   * Date format options
   * @default { weekday: 'short', month: 'short', day: 'numeric' }
   */
  dateFormat?: Intl.DateTimeFormatOptions;

  /**
   * Time format options
   * @default { hour: '2-digit', minute: '2-digit' } (or adds second if showSeconds=true)
   */
  timeFormat?: Intl.DateTimeFormatOptions;

  /**
   * Custom className for styling
   */
  className?: string;

  /**
   * Separator between date and time
   * @default ' • '
   */
  separator?: string;
}

function LiveClockComponent({
  showSeconds = false,
  showDate = false,
  dateFormat,
  timeFormat,
  className = '',
  separator = ' • ',
}: LiveClockProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  const formatTime = useCallback(
    (date: Date): string => {
      // Build time format with optional seconds
      const builtTimeFormat: Intl.DateTimeFormatOptions = {
        ...DEFAULT_TIME_FORMAT,
        ...(showSeconds && { second: '2-digit' }),
      };

      const finalTimeFormat = timeFormat || builtTimeFormat;
      const finalDateFormat = dateFormat || DEFAULT_DATE_FORMAT;

      // Use browser's local timezone (undefined = browser default locale)
      const timeString = date.toLocaleTimeString(undefined, finalTimeFormat);

      if (showDate) {
        const dateString = date.toLocaleDateString(undefined, finalDateFormat);
        return `${dateString}${separator}${timeString}`;
      }

      return timeString;
    },
    [showSeconds, showDate, dateFormat, timeFormat, separator]
  );

  useEffect(() => {
    // Smart interval: 1s if showing seconds, 60s if not
    const interval = showSeconds
      ? UPDATE_INTERVAL_MS.WITH_SECONDS
      : UPDATE_INTERVAL_MS.WITHOUT_SECONDS;

    const timeInterval = setInterval(() => {
      const newTime = new Date();

      // Only update state if the formatted output would actually change
      // This prevents unnecessary re-renders
      setCurrentTime((prevTime) => {
        const prevFormatted = formatTime(prevTime);
        const newFormatted = formatTime(newTime);

        // Only update if display value changed
        return prevFormatted !== newFormatted ? newTime : prevTime;
      });
    }, interval);

    return () => clearInterval(timeInterval);
  }, [showSeconds, formatTime]);

  return <div className={className}>{formatTime(currentTime)}</div>;
}

// Memoize to prevent re-renders when parent re-renders
export const LiveClock = memo(LiveClockComponent);

/**
 * Convenience component for dashboard header
 * Shows: "Mon, Dec 21 • 3:45 PM"
 */
const DashboardClockComponent = () => (
  <LiveClock
    showDate={true}
    showSeconds={false}
    className="hidden sm:block text-sm text-gray-500"
  />
);

DashboardClockComponent.displayName = 'DashboardClock';

export const DashboardClock = memo(DashboardClockComponent);

/**
 * Convenience component for kitchen display
 * Shows time and date separately for large display
 *
 * Performance: Updates every 60 seconds (no seconds shown)
 * Kitchen staff need minute-precision, not second-precision
 */
export const KitchenClock = memo(
  ({ className = '' }: { className?: string }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
      // Kitchen display updates every 60 seconds (no seconds shown)
      // Only update if minute actually changed
      const timeInterval = setInterval(() => {
        const newTime = new Date();
        setCurrentTime((prevTime) => {
          // Only update if minute or hour changed
          const prevMinute = prevTime.getHours() * 60 + prevTime.getMinutes();
          const newMinute = newTime.getHours() * 60 + newTime.getMinutes();
          return prevMinute !== newMinute ? newTime : prevTime;
        });
      }, UPDATE_INTERVAL_MS.WITHOUT_SECONDS);

      return () => clearInterval(timeInterval);
    }, []);

    return (
      <div className={className}>
        <div className="text-4xl font-bold">
          {currentTime.toLocaleTimeString(undefined, DEFAULT_TIME_FORMAT)}
        </div>
        <div className="text-xl text-gray-600">
          {currentTime.toLocaleDateString(undefined, DEFAULT_DATE_FORMAT)}
        </div>
      </div>
    );
  }
);

KitchenClock.displayName = 'KitchenClock';
