import {
  trustedIp,
  UNKNOWN_TRUSTED_IP,
  type TrustedIpRequest,
} from '@/lib/loyalty/trusted-ip';

function request(
  headers: Record<string, string> = {},
  extra: Partial<TrustedIpRequest> = {}
): TrustedIpRequest {
  const lower = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    headers: {
      get: (name: string) => lower.get(name.toLowerCase()) ?? null,
    },
    ...extra,
  };
}

describe('trustedIp', () => {
  it('takes the last X-Forwarded-For entry, never the first', () => {
    // A client prepends `spoofed`; the proxy appends the real peer.
    expect(
      trustedIp(
        request({ 'x-forwarded-for': 'spoofed, 198.51.100.7, 203.0.113.9' })
      )
    ).toBe('203.0.113.9');
  });

  it('ignores a spoofed first entry even when it looks like an IP', () => {
    expect(
      trustedIp(request({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))
    ).toBe('203.0.113.9');
  });

  it('skips empty entries and trims whitespace', () => {
    expect(
      trustedIp(request({ 'x-forwarded-for': '  , 203.0.113.9 ,  ' }))
    ).toBe('203.0.113.9');
  });

  it('falls back to the socket address when X-Forwarded-For is absent', () => {
    expect(
      trustedIp(request({}, { socket: { remoteAddress: '10.0.0.5' } }))
    ).toBe('10.0.0.5');
  });

  it('falls back to the platform peer address', () => {
    expect(trustedIp(request({}, { ip: '10.0.0.6' }))).toBe('10.0.0.6');
  });

  it('returns the shared unknown sentinel when no address is available', () => {
    expect(trustedIp(request())).toBe(UNKNOWN_TRUSTED_IP);
  });

  it('never uses X-Real-IP or other client-supplied headers', () => {
    expect(
      trustedIp(
        request({
          'x-real-ip': '1.2.3.4',
          'cf-connecting-ip': '5.6.7.8',
          forwarded: 'for=9.9.9.9',
        })
      )
    ).toBe(UNKNOWN_TRUSTED_IP);
  });

  it('prefers the proxy-appended header over the socket fallback', () => {
    expect(
      trustedIp(
        request(
          { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' },
          { socket: { remoteAddress: '10.0.0.5' }, ip: '10.0.0.6' }
        )
      )
    ).toBe('203.0.113.9');
  });
});
