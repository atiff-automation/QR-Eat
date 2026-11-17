import type { NextRequest } from 'next/server';

/**
 * Pins `SecurityUtils.getClientIP` to the trusted resolver.
 *
 * The two environments differ in a way a raw header read cannot fake: on
 * Railway the validated `X-Real-IP` wins; off Railway the same header is
 * client-controlled and must be ignored. If `getClientIP` stops delegating to
 * `trustedIp`, at least one direction fails.
 */
function requestWithRealIp(value: string): NextRequest {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'x-real-ip' ? value : null;
      },
    },
  } as unknown as NextRequest;
}

describe('SecurityUtils.getClientIP delegation', () => {
  const originalRailwayEnvironment = process.env.RAILWAY_ENVIRONMENT;

  afterEach(() => {
    if (originalRailwayEnvironment === undefined) {
      delete process.env.RAILWAY_ENVIRONMENT;
    } else {
      process.env.RAILWAY_ENVIRONMENT = originalRailwayEnvironment;
    }
    jest.resetModules();
  });

  it('returns the validated x-real-ip on Railway', async () => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    jest.resetModules();
    const { SecurityUtils } = await import('@/lib/security');

    expect(SecurityUtils.getClientIP(requestWithRealIp('8.8.8.8'))).toBe(
      '8.8.8.8'
    );
  });

  it('rejects a non-routable x-real-ip on Railway', async () => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    jest.resetModules();
    const { SecurityUtils } = await import('@/lib/security');

    expect(SecurityUtils.getClientIP(requestWithRealIp('10.0.0.5'))).toBe(
      'unknown'
    );
  });

  it('ignores the header off Railway and returns unknown', async () => {
    delete process.env.RAILWAY_ENVIRONMENT;
    jest.resetModules();
    const { SecurityUtils } = await import('@/lib/security');

    expect(SecurityUtils.getClientIP(requestWithRealIp('8.8.8.8'))).toBe(
      'unknown'
    );
  });
});
