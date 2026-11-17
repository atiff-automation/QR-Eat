import {
  resolveClientIp,
  trustedIp,
  UNKNOWN_TRUSTED_IP,
  type TrustedIpRequest,
} from '@/lib/client-ip';

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

/** Values that must never become a rate-limit subject. */
const NON_PUBLIC_CANDIDATES = [
  '10.1.2.3',
  '172.16.0.1',
  '172.31.255.255',
  '192.168.1.1',
  '127.0.0.1',
  '169.254.1.1',
  '100.64.0.1',
  '100.127.255.255',
  '0.0.0.0',
  '224.0.0.1',
  '239.255.255.255',
  '240.0.0.1',
  '255.255.255.255',
  '::1',
  '::',
  'fc00::1',
  'fd12:3456::1',
  'fe80::1',
  'ff02::1',
  '::10.0.0.1',
  '::ffff:10.0.0.1',
  '::ffff:0a00:0001',
  '::ffff:127.0.0.1',
  'not-an-ip',
  '999.1.1.1',
  '1.2.3',
  '',
];

describe('resolveClientIp on Railway', () => {
  beforeEach(() => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.RAILWAY_ENVIRONMENT;
    jest.restoreAllMocks();
  });

  it('takes X-Real-IP over X-Forwarded-For', () => {
    expect(
      resolveClientIp(
        request({
          'x-real-ip': '203.0.113.9',
          'x-forwarded-for': '198.51.100.7, 10.0.0.5',
        })
      )
    ).toEqual({
      ip: '203.0.113.9',
      source: 'x-real-ip',
      xffEntries: 2,
    });
  });

  it('falls back to the first X-Forwarded-For entry', () => {
    expect(
      resolveClientIp(
        request({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9' })
      )
    ).toEqual({
      ip: '198.51.100.7',
      source: 'x-forwarded-for',
      xffEntries: 2,
    });
  });

  it('takes the first X-Forwarded-For entry, not the last (P9-10 regression)', () => {
    // Railway prepends the client and appends a per-connection internal hop.
    // The old resolver returned `10.0.0.5`; that is the defect.
    expect(
      trustedIp(
        request({
          'x-forwarded-for': '198.51.100.7, 203.0.113.9, 10.0.0.5',
        })
      )
    ).toBe('198.51.100.7');
  });

  it('uses a forged X-Real-IP as-is; the edge overwrites it, so there is no second check', () => {
    // The probe proved the edge replaces a client-supplied value. The resolver
    // must not add a comparison that would reject the value the edge supplied.
    expect(
      trustedIp(
        request({
          'x-real-ip': '198.51.100.9',
          'x-forwarded-for': '203.0.113.9',
        })
      )
    ).toBe('198.51.100.9');
  });

  it('counts non-empty X-Forwarded-For entries', () => {
    expect(
      resolveClientIp(request({ 'x-forwarded-for': '  , 198.51.100.7 ,  ' }))
        .xffEntries
    ).toBe(1);
    expect(
      resolveClientIp(request({ 'x-forwarded-for': '198.51.100.7, 10.0.0.5' }))
        .xffEntries
    ).toBe(2);
    expect(resolveClientIp(request()).xffEntries).toBe(0);
    expect(
      resolveClientIp(request({ 'x-forwarded-for': ' , , ' })).xffEntries
    ).toBe(0);
  });

  it('strips IPv4 and IPv6 port forms', () => {
    expect(trustedIp(request({ 'x-real-ip': '1.2.3.4:5678' }))).toBe('1.2.3.4');
    expect(trustedIp(request({ 'x-real-ip': '[2001:db8::1]:443' }))).toBe(
      '2001:db8::1'
    );
    expect(trustedIp(request({ 'x-real-ip': '[2001:db8::1]' }))).toBe(
      '2001:db8::1'
    );
  });

  it('lowercases IPv6 and strips a zone id', () => {
    expect(trustedIp(request({ 'x-real-ip': '2001:DB8::ABCD' }))).toBe(
      '2001:db8::abcd'
    );
    expect(trustedIp(request({ 'x-real-ip': '2001:db8::1%eth0' }))).toBe(
      '2001:db8::1'
    );
  });

  it('allows documentation ranges so tests can use them', () => {
    for (const address of ['192.0.2.1', '198.51.100.7', '203.0.113.9']) {
      expect(trustedIp(request({ 'x-real-ip': address }))).toBe(address);
    }
  });

  it('rejects a non-public X-Real-IP and falls through to X-Forwarded-For', () => {
    expect(
      trustedIp(
        request({
          'x-real-ip': '10.0.0.1',
          'x-forwarded-for': '198.51.100.7',
        })
      )
    ).toBe('198.51.100.7');
  });

  it('rejects a non-public first X-Forwarded-For entry and uses the socket', () => {
    expect(
      trustedIp(
        request(
          { 'x-forwarded-for': '10.0.0.1, 198.51.100.7' },
          { socket: { remoteAddress: '8.8.8.8' } }
        )
      )
    ).toBe('8.8.8.8');
  });

  it('rejects a non-public socket peer and uses request.ip as the platform source', () => {
    expect(
      resolveClientIp(
        request({}, { socket: { remoteAddress: '100.64.0.1' }, ip: '8.8.4.4' })
      )
    ).toEqual({
      ip: '8.8.4.4',
      source: 'platform',
      xffEntries: 0,
    });
  });

  it('strips port and zone forms at the socket and request.ip positions', () => {
    expect(
      trustedIp(request({}, { socket: { remoteAddress: '1.2.3.4:5678' } }))
    ).toBe('1.2.3.4');
    expect(
      trustedIp(request({}, { socket: { remoteAddress: '[2001:db8::1]:443' } }))
    ).toBe('2001:db8::1');
    expect(
      trustedIp(request({}, { socket: { remoteAddress: '2001:db8::1%eth0' } }))
    ).toBe('2001:db8::1');
    expect(trustedIp(request({}, { ip: '1.2.3.4:5678' }))).toBe('1.2.3.4');
    expect(trustedIp(request({}, { ip: '[2001:db8::1]:443' }))).toBe(
      '2001:db8::1'
    );
    expect(trustedIp(request({}, { ip: '2001:db8::1%eth0' }))).toBe(
      '2001:db8::1'
    );
  });

  it.each(NON_PUBLIC_CANDIDATES)(
    'rejects %p at every resolution position',
    (candidate) => {
      // Header position (X-Real-IP and X-Forwarded-For[0]).
      expect(
        trustedIp(
          request(
            { 'x-real-ip': candidate, 'x-forwarded-for': candidate },
            { socket: { remoteAddress: '8.8.8.8' } }
          )
        )
      ).toBe('8.8.8.8');

      // Socket position.
      expect(
        trustedIp(
          request({}, { socket: { remoteAddress: candidate }, ip: '8.8.4.4' })
        )
      ).toBe('8.8.4.4');

      // request.ip position, with nothing else available.
      expect(trustedIp(request({}, { ip: candidate }))).toBe(
        UNKNOWN_TRUSTED_IP
      );
    }
  );
});

describe('resolveClientIp off Railway', () => {
  beforeEach(() => {
    delete process.env.RAILWAY_ENVIRONMENT;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.RAILWAY_ENVIRONMENT;
    jest.restoreAllMocks();
  });

  it('ignores both headers because they are client-controlled without a proxy', () => {
    expect(
      resolveClientIp(
        request(
          {
            'x-real-ip': '203.0.113.9',
            'x-forwarded-for': '198.51.100.7',
          },
          { socket: { remoteAddress: '8.8.8.8' } }
        )
      )
    ).toEqual({
      ip: '8.8.8.8',
      source: 'socket',
      xffEntries: 1,
    });
  });

  it('ignores the headers and uses request.ip as the platform source', () => {
    expect(
      resolveClientIp(
        request({ 'x-real-ip': '203.0.113.9' }, { ip: '8.8.4.4' })
      )
    ).toEqual({
      ip: '8.8.4.4',
      source: 'platform',
      xffEntries: 0,
    });
  });

  it('returns unknown when only client-controlled headers are present', () => {
    expect(
      resolveClientIp(
        request({
          'x-real-ip': '203.0.113.9',
          'x-forwarded-for': '198.51.100.7',
        })
      )
    ).toEqual({
      ip: UNKNOWN_TRUSTED_IP,
      source: 'unknown',
      xffEntries: 1,
    });
  });

  it('rejects a CGNAT socket peer', () => {
    expect(
      trustedIp(request({}, { socket: { remoteAddress: '100.64.12.7' } }))
    ).toBe(UNKNOWN_TRUSTED_IP);
  });
});
