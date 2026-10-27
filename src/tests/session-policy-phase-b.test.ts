import { describe, expect, it } from '@jest/globals';
import {
  describeDevice,
  selectSessionsToEvict,
  sessionsToEvict,
} from '@/lib/rbac/session-policy';

const at = (minute: number) => new Date(`2026-10-27T06:${minute}:00.000Z`);

describe('Phase B session policy', () => {
  it('leaves room for the next login at the five-session cap', () => {
    expect(sessionsToEvict(0, 5)).toBe(0);
    expect(sessionsToEvict(4, 5)).toBe(0);
    expect(sessionsToEvict(5, 5)).toBe(1);
    expect(sessionsToEvict(7, 5)).toBe(3);
  });

  it('evicts the least recently active web session first', () => {
    const sessions = [
      {
        id: 'newest',
        lastActivity: at(30),
        deviceId: 'web-new',
        deviceType: 'web',
      },
      {
        id: 'oldest',
        lastActivity: at(10),
        deviceId: 'web-old',
        deviceType: 'web',
      },
      {
        id: 'middle',
        lastActivity: at(20),
        deviceId: 'web-mid',
        deviceType: 'web',
      },
    ];

    expect(
      selectSessionsToEvict(sessions, 3, 'incoming').map((item) => item.id)
    ).toEqual(['oldest']);
  });

  it('keeps Counter sessions when a web session is available', () => {
    const sessions = [
      {
        id: 'counter',
        lastActivity: at(5),
        deviceId: 'counter-1',
        deviceType: 'counter',
      },
      {
        id: 'web-old',
        lastActivity: at(10),
        deviceId: 'web-1',
        deviceType: 'web',
      },
      {
        id: 'web-new',
        lastActivity: at(20),
        deviceId: 'web-2',
        deviceType: 'web',
      },
    ];

    expect(
      selectSessionsToEvict(sessions, 3, 'incoming').map((item) => item.id)
    ).toEqual(['web-old']);
  });

  it('does not evict the incoming device', () => {
    const sessions = [
      {
        id: 'same-device',
        lastActivity: at(1),
        deviceId: 'device-1',
        deviceType: 'web',
      },
      {
        id: 'other-device',
        lastActivity: at(20),
        deviceId: 'device-2',
        deviceType: 'web',
      },
    ];

    expect(
      selectSessionsToEvict(sessions, 2, 'device-1').map((item) => item.id)
    ).toEqual([]);
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
