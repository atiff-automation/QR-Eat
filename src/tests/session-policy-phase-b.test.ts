import { describe, expect, it } from '@jest/globals';
import { describeDevice, sessionsToEvict } from '@/lib/rbac/session-policy';

describe('Phase B session policy', () => {
  it('leaves room for the next login at the five-session cap', () => {
    expect(sessionsToEvict(0, 5)).toBe(0);
    expect(sessionsToEvict(4, 5)).toBe(0);
    expect(sessionsToEvict(5, 5)).toBe(1);
    expect(sessionsToEvict(7, 5)).toBe(3);
  });

  it('labels web and Counter user agents', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      ).label
    ).toBe('Chrome on Windows');
    expect(describeDevice('Tabtep-Counter/Android okhttp/4.12.0').label).toBe(
      'Tabtep Counter'
    );
    expect(
      describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')
        .label
    ).toBe('Safari on iOS');
  });
});
