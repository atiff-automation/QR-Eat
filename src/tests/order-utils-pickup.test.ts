import { formatPickupNumber } from '@/lib/order-utils';

describe('formatPickupNumber', () => {
  it('formats a daily sequence for customer display', () => {
    expect(formatPickupNumber(42)).toBe('#042');
    expect(formatPickupNumber(7)).toBe('#007');
  });

  it('keeps numbers above three digits', () => {
    expect(formatPickupNumber(1234)).toBe('#1234');
  });

  it('returns null for missing or invalid sequences', () => {
    expect(formatPickupNumber(null)).toBeNull();
    expect(formatPickupNumber(undefined)).toBeNull();
    expect(formatPickupNumber(0)).toBeNull();
    expect(formatPickupNumber(-1)).toBeNull();
  });
});
