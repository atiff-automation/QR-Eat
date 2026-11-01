import { isPublicApiRoute } from '@/middleware';

/**
 * Regression guard for the pairing rollout.
 *
 * `POST /api/devices/pair` is deliberately unauthenticated — the pairing code is
 * the credential — but `/api/devices/*` sits behind session auth. When the route
 * shipped it was missing from this allow-list and returned `401` before the
 * handler ran. Handler tests call the function directly and cannot catch that,
 * so the list itself is what gets tested here.
 */
describe('isPublicApiRoute — device pairing', () => {
  it('lets the pairing endpoint through', () => {
    expect(isPublicApiRoute('/api/devices/pair')).toBe(true);
  });

  it('keeps device token exchange public', () => {
    expect(isPublicApiRoute('/api/devices/token')).toBe(true);
  });

  it('still requires a session to provision a device', () => {
    expect(isPublicApiRoute('/api/devices/provision')).toBe(false);
  });

  it('still requires a session to list devices', () => {
    expect(isPublicApiRoute('/api/devices')).toBe(false);
  });

  it('still requires a session to read or reissue a pairing code', () => {
    expect(isPublicApiRoute('/api/devices/device-1/code')).toBe(false);
  });

  it('still requires a session to revoke a device', () => {
    expect(isPublicApiRoute('/api/devices/device-1/revoke')).toBe(false);
  });
});

describe('isPublicApiRoute — station device endpoints', () => {
  it.each([
    '/api/stations/me/snapshot',
    '/api/stations/me/settings',
    '/api/stations/me/heartbeat',
    '/api/stations/me/print-ack',
    '/api/events/station',
  ])('allows %s, which authenticates with the device token', (path) => {
    expect(isPublicApiRoute(path)).toBe(true);
  });

  it('does not allow the owner-facing station routes', () => {
    expect(isPublicApiRoute('/api/stations')).toBe(false);
  });
});
