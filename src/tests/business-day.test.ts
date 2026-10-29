import {
  addBusinessDays,
  formatBusinessDate,
  getBusinessDate,
  getBusinessDayEnd,
  getBusinessDayStart,
} from '@/lib/time/business-day';

describe('business day helpers', () => {
  const clock = { timezone: 'Asia/Kuala_Lumpur', closeTime: '04:00' };

  it('keeps after-midnight sales on the previous business date before cutoff', () => {
    expect(getBusinessDate(new Date('2026-10-28T17:30:00.000Z'), clock)).toBe(
      '2026-10-28'
    ); // 01:30 MYT on 29 Oct
    expect(getBusinessDate(new Date('2026-10-28T20:00:00.000Z'), clock)).toBe(
      '2026-10-29'
    ); // 04:00 MYT
  });

  it('starts and ends the business day at local cutoff', () => {
    const start = getBusinessDayStart('2026-10-29', clock);
    const end = getBusinessDayEnd('2026-10-29', clock);
    expect(start.toISOString()).toBe('2026-10-28T20:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-29T20:00:00.000Z');
  });

  it('adds days without timezone drift', () => {
    expect(addBusinessDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addBusinessDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(formatBusinessDate('2026-10-29')).toContain('2026');
  });
});
