import { describe, expect, it } from '@jest/globals';
import { NextRequest } from 'next/server';
import {
  DEVICE_COOKIE_NAME,
  normalizeDeviceId,
  normalizeDeviceType,
  resolveDeviceId,
} from '@/lib/device-id';

const validId = '11111111-1111-4111-8111-111111111111';

function request(cookie?: string) {
  return new NextRequest('http://localhost/api/auth/rbac-login', {
    headers: cookie ? { cookie } : undefined,
  });
}

describe('device identity resolution', () => {
  it('accepts a valid supplied id', () => {
    expect(normalizeDeviceId(validId)).toBe(validId);
  });

  it('rejects malformed supplied ids', () => {
    expect(normalizeDeviceId('short')).toBeNull();
    expect(normalizeDeviceId('bad id with spaces')).toBeNull();
    expect(normalizeDeviceId(123)).toBeNull();
  });

  it('uses the web device cookie', () => {
    expect(
      resolveDeviceId(
        request(`${DEVICE_COOKIE_NAME}=${validId}`),
        undefined,
        'web'
      )
    ).toBe(validId);
  });

  it('does not invent a counter id for an old counter client', () => {
    expect(resolveDeviceId(request(), undefined, 'counter')).toBeNull();
  });

  it('generates an id for a new web browser', () => {
    const id = resolveDeviceId(request(), undefined, 'web');
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });

  it('detects counter user agents', () => {
    expect(normalizeDeviceType(undefined, 'okhttp/4.12.0')).toBe('counter');
    expect(normalizeDeviceType(undefined, 'Mozilla/5.0 Chrome/153')).toBe(
      'web'
    );
  });
});
