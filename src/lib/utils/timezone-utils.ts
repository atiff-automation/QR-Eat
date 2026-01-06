/**
 * Timezone Utilities
 * For converting dates to restaurant timezone in reports
 *
 * @see implementation_plan_production_v3.md - Integration Utilities
 */

/**
 * Convert date to restaurant's timezone
 * Used for accurate reporting across different timezones
 *
 * @param date - Date to convert
 * @param timezone - IANA timezone (e.g., 'Asia/Kuala_Lumpur')
 * @returns Date object in restaurant's timezone
 */
export function convertToRestaurantTimezone(
  date: Date,
  timezone: string
): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '0');
  const month =
    parseInt(parts.find((p) => p.type === 'month')?.value || '0') - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '0');
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');
  const second = parseInt(parts.find((p) => p.type === 'second')?.value || '0');

  return new Date(year, month, day, hour, minute, second);
}
