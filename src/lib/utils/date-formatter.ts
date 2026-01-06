/**
 * Date/Time Formatting Utilities
 * Uses restaurant system preferences for consistent formatting
 *
 * @see implementation_plan_production_v3.md - Integration Utilities
 */

/**
 * Get Intl.DateTimeFormatOptions based on system preferences
 *
 * @param dateFormat - Date format preference (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
 * @param timeFormat - Time format preference (12h, 24h)
 * @returns Intl.DateTimeFormatOptions object
 */
export function getDateFormatOptions(
  dateFormat: string,
  timeFormat: string
): Intl.DateTimeFormatOptions {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  };

  switch (dateFormat) {
    case 'DD/MM/YYYY':
      return { ...options, day: '2-digit', month: '2-digit', year: 'numeric' };
    case 'MM/DD/YYYY':
      return { ...options, month: '2-digit', day: '2-digit', year: 'numeric' };
    case 'YYYY-MM-DD':
      return { ...options, year: 'numeric', month: '2-digit', day: '2-digit' };
    default:
      return { ...options, day: '2-digit', month: 'short', year: 'numeric' };
  }
}

/**
 * Format order date using system preferences
 *
 * @param date - Date to format (Date object or ISO string)
 * @param settings - System preferences for date/time formatting
 * @returns Formatted date string
 */
export function formatOrderDate(
  date: Date | string,
  settings: {
    dateFormat: string;
    timeFormat: string;
  }
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const options = getDateFormatOptions(
    settings.dateFormat,
    settings.timeFormat
  );
  return dateObj.toLocaleString('en-MY', options);
}
