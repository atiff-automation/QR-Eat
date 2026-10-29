/**
 * Restaurant business-day helpers.
 *
 * A business day is identified by a local calendar date and a restaurant-local
 * cutoff. It is not a UTC or server-local midnight.
 */

export interface BusinessDayClock {
  timezone: string;
  closeTime: string; // HH:mm, restaurant-local
}

export type BusinessDate = string; // YYYY-MM-DD

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsFor(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Unable to read ${type} for ${timezone}`);
    return Number(value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function dateOnlyFromParts(parts: ZonedParts): BusinessDate {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(
    2,
    '0'
  )}-${String(parts.day).padStart(2, '0')}`;
}

function parseDateOnly(date: BusinessDate): {
  year: number;
  month: number;
  day: number;
} {
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`Invalid business date: ${date}`);
  }
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function parseCloseTime(closeTime: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(closeTime);
  if (!match) throw new Error(`Invalid business-day close time: ${closeTime}`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function offsetMs(date: Date, timezone: string): number {
  const parts = partsFor(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a restaurant-local date/time into a UTC instant. */
export function zonedDateTimeToUtc(
  date: BusinessDate,
  time: string,
  timezone: string
): Date {
  const { year, month, day } = parseDateOnly(date);
  const { hour, minute } = parseCloseTime(time);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const first = guess - offsetMs(new Date(guess), timezone);
  const second = guess - offsetMs(new Date(first), timezone);
  return new Date(second);
}

export function addBusinessDays(
  date: BusinessDate,
  days: number
): BusinessDate {
  const { year, month, day } = parseDateOnly(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function getBusinessDate(
  at: Date,
  clock: BusinessDayClock
): BusinessDate {
  const parts = partsFor(at, clock.timezone);
  const date = dateOnlyFromParts(parts);
  const cutoff = parseCloseTime(clock.closeTime);
  const localMinutes = parts.hour * 60 + parts.minute;
  const cutoffMinutes = cutoff.hour * 60 + cutoff.minute;
  return localMinutes < cutoffMinutes ? addBusinessDays(date, -1) : date;
}

/** First instant belonging to the business date. */
export function getBusinessDayStart(
  businessDate: BusinessDate,
  clock: BusinessDayClock
): Date {
  return zonedDateTimeToUtc(businessDate, clock.closeTime, clock.timezone);
}

/** Next business date's first instant. */
export function getBusinessDayEnd(
  businessDate: BusinessDate,
  clock: BusinessDayClock
): Date {
  return getBusinessDayStart(addBusinessDays(businessDate, 1), clock);
}

/**
 * Range used by reports.
 * - open day: from its opening instant until now
 * - closed day: from its opening instant until closedAt
 */
export function getBusinessDayReportRange(
  businessDate: BusinessDate,
  clock: BusinessDayClock,
  openedAt: Date,
  closedAt: Date | null,
  now = new Date()
): { start: Date; end: Date } {
  const start =
    openedAt.getTime() > 0
      ? openedAt
      : getBusinessDayStart(businessDate, clock);
  return { start, end: closedAt ?? now };
}

export function parseBusinessDateFromDb(value: Date | string): BusinessDate {
  if (typeof value === 'string') {
    const date = value.slice(0, 10);
    if (!DATE_PATTERN.test(date))
      throw new Error(`Invalid DB business date: ${value}`);
    return date;
  }
  return value.toISOString().slice(0, 10);
}

export function toDbBusinessDate(date: BusinessDate): Date {
  parseDateOnly(date);
  return new Date(`${date}T00:00:00.000Z`);
}

export function formatBusinessDate(date: BusinessDate): string {
  const { year, month, day } = parseDateOnly(date);
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function isValidCloseTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}
