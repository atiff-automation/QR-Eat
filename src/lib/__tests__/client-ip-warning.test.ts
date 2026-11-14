/* eslint-disable @typescript-eslint/no-require-imports */
import type {
  resolveClientIp as resolveClientIpType,
  warnIfEdgeHeadersDisagree as warnIfEdgeHeadersDisagreeType,
  warnIfUnknownTrustedIp as warnIfUnknownTrustedIpType,
} from '@/lib/client-ip';

/**
 * Both warnings are module-instance-wide and deliberately not repeated. Each
 * test gets a fresh module registry so the once-only flags start unset.
 */
describe('warnIfUnknownTrustedIp', () => {
  it('logs once for the unknown sentinel and never for a real address', () => {
    jest.isolateModules(() => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { warnIfUnknownTrustedIp, UNKNOWN_TRUSTED_IP } =
        require('@/lib/client-ip') as {
          warnIfUnknownTrustedIp: typeof warnIfUnknownTrustedIpType;
          UNKNOWN_TRUSTED_IP: string;
        };

      warnIfUnknownTrustedIp('203.0.113.9');
      expect(warn).not.toHaveBeenCalled();

      warnIfUnknownTrustedIp(UNKNOWN_TRUSTED_IP);
      warnIfUnknownTrustedIp(UNKNOWN_TRUSTED_IP);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe(
        '[loyalty] No trusted client address; the strictest loyalty rate limit applies to all callers.'
      );
      expect(String(warn.mock.calls[0]?.[0])).not.toContain('203.0.113.9');
      warn.mockRestore();
    });
  });
});

describe('warnIfEdgeHeadersDisagree', () => {
  it('warns once on disagreement and never on agreement', () => {
    jest.isolateModules(() => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { warnIfEdgeHeadersDisagree } = require('@/lib/client-ip') as {
        warnIfEdgeHeadersDisagree: typeof warnIfEdgeHeadersDisagreeType;
      };

      warnIfEdgeHeadersDisagree('203.0.113.9', '203.0.113.9');
      expect(warn).not.toHaveBeenCalled();

      warnIfEdgeHeadersDisagree('203.0.113.9', '198.51.100.7');
      warnIfEdgeHeadersDisagree('203.0.113.9', '198.51.100.7');

      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain('Edge headers disagree');
      expect(message).toContain('client address may be misconfigured');
      expect(message).not.toContain('203.0.113.9');
      expect(message).not.toContain('198.51.100.7');
      warn.mockRestore();
    });
  });

  it('does not warn when either value is absent or not globally routable', () => {
    jest.isolateModules(() => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { warnIfEdgeHeadersDisagree } = require('@/lib/client-ip') as {
        warnIfEdgeHeadersDisagree: typeof warnIfEdgeHeadersDisagreeType;
      };

      warnIfEdgeHeadersDisagree(null, '198.51.100.7');
      warnIfEdgeHeadersDisagree('203.0.113.9', null);
      warnIfEdgeHeadersDisagree('10.0.0.1', '203.0.113.9');
      warnIfEdgeHeadersDisagree('203.0.113.9', 'not-an-ip');

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it('fires from the resolver on Railway when the headers disagree', () => {
    jest.isolateModules(() => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.RAILWAY_ENVIRONMENT = 'production';
      const { resolveClientIp } = require('@/lib/client-ip') as {
        resolveClientIp: typeof resolveClientIpType;
      };

      const request = {
        headers: {
          get: (name: string) =>
            name === 'x-real-ip'
              ? '203.0.113.9'
              : name === 'x-forwarded-for'
                ? '198.51.100.7'
                : null,
        },
      };

      try {
        expect(resolveClientIp(request).ip).toBe('203.0.113.9');
        resolveClientIp(request);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).not.toContain('203.0.113.9');
        expect(String(warn.mock.calls[0]?.[0])).not.toContain('198.51.100.7');
      } finally {
        delete process.env.RAILWAY_ENVIRONMENT;
        warn.mockRestore();
      }
    });
  });
});
