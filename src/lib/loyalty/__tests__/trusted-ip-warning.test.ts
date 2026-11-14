/* eslint-disable @typescript-eslint/no-require-imports */
import type { warnIfUnknownTrustedIp as warnIfUnknownTrustedIpType } from '@/lib/loyalty/trusted-ip';

/**
 * The warning is module-instance-wide and deliberately not repeated. Each test
 * gets a fresh module registry so the once-only flag starts unset.
 */
describe('warnIfUnknownTrustedIp', () => {
  it('logs once for the unknown sentinel and never for a real address', () => {
    jest.isolateModules(() => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { warnIfUnknownTrustedIp, UNKNOWN_TRUSTED_IP } =
        require('@/lib/loyalty/trusted-ip') as {
          warnIfUnknownTrustedIp: typeof warnIfUnknownTrustedIpType;
          UNKNOWN_TRUSTED_IP: string;
        };

      warnIfUnknownTrustedIp('203.0.113.9');
      expect(warn).not.toHaveBeenCalled();

      warnIfUnknownTrustedIp(UNKNOWN_TRUSTED_IP);
      warnIfUnknownTrustedIp(UNKNOWN_TRUSTED_IP);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe(
        '[loyalty] No trusted client address (X-Forwarded-For is missing); the strictest loyalty rate limit applies to all callers.'
      );
      expect(String(warn.mock.calls[0]?.[0])).not.toContain('203.0.113.9');
      warn.mockRestore();
    });
  });
});
