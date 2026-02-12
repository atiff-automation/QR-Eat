export type PeriodPreset = 'today' | 'week' | 'month' | 'custom';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Returns a date range for a given period preset.
 * Creates fresh Date objects — no mutation of shared references.
 * `endDate` is always set to end-of-day (23:59:59.999) to include
 * all records created on the last day of the range.
 */
export function getDateRange(preset: PeriodPreset | string): DateRange {
  const now = new Date();
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );

  switch (preset) {
    case 'today':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        endDate,
      };
    case 'week': {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      return { startDate: weekStart, endDate };
    }
    case 'month':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate,
      };
    default:
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate,
      };
  }
}
