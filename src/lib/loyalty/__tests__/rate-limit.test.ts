import { prisma } from '@/lib/database';
import {
  DEFAULT_RATE_LIMITS,
  enforceRateLimits,
  incrementRateLimit,
  RATE_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  retryAfterSeconds,
  STRICTEST_RATE_LIMIT,
  windowStart,
  type RateLimitSubjectInput,
} from '@/lib/loyalty/rate-limit';
import { UNKNOWN_TRUSTED_IP } from '@/lib/client-ip';

jest.mock('@/lib/database', () => ({
  prisma: { $queryRaw: jest.fn(), $transaction: jest.fn() },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const phone = '+60123456789';

/** Same fixed window for every attempt in a test. */
const now = new Date('2026-11-14T10:15:30.000Z');

type CounterKey = string;

function createCounter() {
  const counts = new Map<CounterKey, number>();

  return {
    counts,
    query: jest.fn(
      async (
        _strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<Array<{ count: number }>> => {
        const [, keyRestaurantId, scope, subject, windowStartAt] = values;
        const key = [
          keyRestaurantId,
          scope,
          subject,
          (windowStartAt as Date).toISOString(),
        ].join('|');
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return [{ count: next }];
      }
    ),
  };
}

function installCounter() {
  const counter = createCounter();
  (prisma.$queryRaw as jest.Mock).mockImplementation(counter.query);
  // A refusal throws inside the transaction; mirror Postgres by restoring the
  // counter snapshot so a refused attempt consumes no bucket.
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (client: typeof prisma) => unknown) => {
      const snapshot = new Map(counter.counts);
      try {
        return await callback(prisma);
      } catch (error) {
        counter.counts.clear();
        for (const [key, value] of snapshot) counter.counts.set(key, value);
        throw error;
      }
    }
  );
  return counter;
}

function subject(
  overrides: Partial<RateLimitSubjectInput> = {}
): RateLimitSubjectInput {
  return {
    restaurantId,
    sessionId: 'session-1',
    phone: null,
    ip: '203.0.113.9',
    ...overrides,
  };
}

describe('rate limit window', () => {
  it('floors the window to the UTC hour', () => {
    expect(windowStart(now).toISOString()).toBe('2026-11-14T10:00:00.000Z');
    expect(
      windowStart(new Date('2026-11-14T10:00:00.000Z')).toISOString()
    ).toBe('2026-11-14T10:00:00.000Z');
  });

  it('rounds retryAfterSeconds up to the next ten seconds (OWASP)', () => {
    // 10:15:30 → 11:00:00 is 44m30s.
    expect(retryAfterSeconds(now)).toBe(2670);
    // 10:15:35 → 2665s, rounded up to 2670.
    expect(retryAfterSeconds(new Date('2026-11-14T10:15:35.000Z'))).toBe(2670);
    // One second left rounds up to the minimum of ten.
    expect(retryAfterSeconds(new Date('2026-11-14T10:59:59.500Z'))).toBe(10);
    expect(retryAfterSeconds(new Date('2026-11-14T10:00:00.000Z'))).toBe(
      RATE_LIMIT_WINDOW_MS / 1000
    );
  });
});

describe('incrementRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses one atomic INSERT … ON CONFLICT … RETURNING statement', async () => {
    const counter = installCounter();

    await incrementRateLimit(
      { restaurantId, scope: 'RESTAURANT', subject: restaurantId },
      now
    );

    expect(counter.query).toHaveBeenCalledTimes(1);
    const strings = (prisma.$queryRaw as jest.Mock).mock.calls[0][0] as
      | TemplateStringsArray
      | undefined;
    const sql = strings?.join(' ? ') ?? '';

    expect(sql).toContain('INSERT INTO "rate_limit_counters"');
    expect(sql).toContain(
      'ON CONFLICT ("restaurantId", "scope", "subject", "windowStart")'
    );
    expect(sql).toContain('DO UPDATE SET');
    expect(sql).toContain('"count" = "rate_limit_counters"."count" + 1');
    expect(sql).toContain('RETURNING "count"');
    // A read-then-write would need a separate SELECT/UPDATE.
    expect(sql).not.toMatch(/\bSELECT\b/);
    expect(sql).not.toMatch(/\bUPDATE\s+"rate_limit_counters"\s+SET\b/);
  });

  it('passes the bucket fields and the floored window', async () => {
    const counter = installCounter();

    await incrementRateLimit(
      { restaurantId, scope: 'QR_SESSION', subject: 'session-1' },
      now
    );

    const values = (prisma.$queryRaw as jest.Mock).mock.calls[0].slice(1);
    expect(values[1]).toBe(restaurantId);
    expect(values[2]).toBe('QR_SESSION');
    expect(values[3]).toBe('session-1');
    expect((values[4] as Date).toISOString()).toBe('2026-11-14T10:00:00.000Z');
    expect(counter.counts.size).toBe(1);
  });
});

describe('enforceRateLimits — guest requests are skipped', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
  });

  it('writes no counter when the request carries no phone', async () => {
    installCounter();

    const decision = await enforceRateLimits(subject({ phone: null }), now);

    expect(decision).toEqual({
      allowed: true,
      refusal: null,
      failedOpen: false,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats a blank phone as no phone', async () => {
    installCounter();

    const decision = await enforceRateLimits(subject({ phone: '   ' }), now);

    expect(decision.allowed).toBe(true);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('counts only the edge-IP bucket for an invalid phone (S-3)', async () => {
    const counter = installCounter();

    await enforceRateLimits(subject({ phone: 'not-a-phone' }), now);

    const scopes = [...counter.counts.keys()].map((key) => key.split('|')[1]);
    expect(scopes).not.toContain('PHONE_HASH');
    expect(scopes).not.toContain('RESTAURANT');
    expect(scopes).not.toContain('QR_SESSION');
    expect(scopes).toEqual(['EDGE_IP']);
  });

  it('does not let a malformed-phone flood exhaust the restaurant bucket (S-3)', async () => {
    const counter = installCounter();
    const restaurantKey = [
      restaurantId,
      'RESTAURANT',
      restaurantId,
      windowStart(now).toISOString(),
    ].join('|');

    for (let index = 0; index < 40; index += 1) {
      const decision = await enforceRateLimits(
        subject({
          phone: `not-a-phone-${index}`,
          sessionId: `flood-${index}`,
          ip: '203.0.113.9',
        }),
        now
      );
      expect(decision.allowed).toBe(true);
    }

    // 40 malformed attempts, all from one IP: the shared restaurant bucket was
    // never touched, so real customers are not denied loyalty pricing.
    expect(counter.counts.get(restaurantKey)).toBeUndefined();

    await enforceRateLimits(
      subject({
        phone: '+60123456789',
        sessionId: 'valid-phone',
        ip: '203.0.113.9',
      }),
      now
    );

    // A valid phone still consumes the restaurant bucket.
    expect(counter.counts.get(restaurantKey)).toBe(1);
  });
});

describe('enforceRateLimits — exact bucket limits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
  });

  async function attempt(
    index: number,
    overrides: Partial<RateLimitSubjectInput>
  ) {
    return enforceRateLimits(
      subject({
        sessionId: `session-${index}`,
        ip: `10.0.${Math.floor(index / 250)}.${index % 250}`,
        phone,
        ...overrides,
      }),
      now
    );
  }

  it('one order consumes exactly one unit of every bucket', async () => {
    const counter = installCounter();

    const decision = await attempt(0, {});
    expect(decision.allowed).toBe(true);

    // Restaurant, session, edge IP and phone hash — one increment each.
    expect(counter.counts.size).toBe(4);
    for (const value of counter.counts.values()) {
      expect(value).toBe(1);
    }
  });

  it('allows 10 per QR session per hour and refuses the 11th', async () => {
    installCounter();

    for (let index = 0; index < RATE_LIMITS.QR_SESSION; index += 1) {
      const decision = await attempt(index, { sessionId: 'session-fixed' });
      expect(decision.allowed).toBe(true);
    }

    const decision = await attempt(RATE_LIMITS.QR_SESSION, {
      sessionId: 'session-fixed',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'QR_SESSION',
      limit: 10,
      count: 11,
    });
  });

  it('allows 10 per phoneHash per hour and refuses the 11th', async () => {
    installCounter();

    for (let index = 0; index < RATE_LIMITS.PHONE_HASH; index += 1) {
      const decision = await attempt(index, {});
      expect(decision.allowed).toBe(true);
    }

    const decision = await attempt(RATE_LIMITS.PHONE_HASH, {});
    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'PHONE_HASH',
      limit: 10,
      count: 11,
    });
    // The subject is the keyed hash, never the phone.
    expect(decision.refusal?.subject).not.toBe(phone);
    expect(decision.refusal?.subject).toMatch(/^[a-f0-9]{64}$/);
  });

  it('allows 120 per trusted edge IP per hour and refuses the 121st', async () => {
    installCounter();

    for (let index = 0; index < RATE_LIMITS.EDGE_IP; index += 1) {
      const decision = await enforceRateLimits(
        subject({
          phone: `+6012345${String(index).padStart(4, '0')}`,
          sessionId: null,
          ip: '198.51.100.20',
          limits: { restaurant: 1000 },
        }),
        now
      );
      expect(decision.allowed).toBe(true);
    }

    const decision = await enforceRateLimits(
      subject({
        phone: '+60123459999',
        sessionId: null,
        ip: '198.51.100.20',
        limits: { restaurant: 1000 },
      }),
      now
    );
    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'EDGE_IP',
      limit: 120,
      count: 121,
    });
  });

  it('reads the restaurant ceiling from the supplied settings value', async () => {
    installCounter();

    const limits = { restaurant: 5 };
    for (let index = 0; index < 5; index += 1) {
      const decision = await attempt(index, {
        limits,
        sessionId: `custom-session-${index}`,
      });
      expect(decision.allowed).toBe(true);
    }

    const decision = await attempt(5, {
      limits,
      sessionId: 'custom-session-final',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'RESTAURANT',
      limit: 5,
      count: 6,
    });
  });

  it('defaults the restaurant ceiling to 30', () => {
    expect(DEFAULT_RATE_LIMITS.restaurant).toBe(30);
    expect(DEFAULT_RATE_LIMITS.phoneHash).toBe(10);
    expect(DEFAULT_RATE_LIMITS.session).toBe(10);
    expect(DEFAULT_RATE_LIMITS.edgeIp).toBe(120);
  });
});

describe('enforceRateLimits — transactional rollback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
  });

  function counterKey(scope: string, subjectValue: string): string {
    return [
      restaurantId,
      scope,
      subjectValue,
      windowStart(now).toISOString(),
    ].join('|');
  }

  it('consumes no bucket when a later bucket refuses', async () => {
    const counter = installCounter();

    // Fill the session bucket while rotating the IP so only the session bucket
    // can trip. Every attempt also increments the shared restaurant bucket.
    for (let index = 0; index < RATE_LIMITS.QR_SESSION; index += 1) {
      const decision = await enforceRateLimits(
        subject({
          phone,
          sessionId: 'session-fixed',
          ip: `10.9.0.${index}`,
        }),
        now
      );
      expect(decision.allowed).toBe(true);
    }

    const restaurantKey = counterKey('RESTAURANT', restaurantId);
    expect(counter.counts.get(restaurantKey)).toBe(RATE_LIMITS.QR_SESSION);

    const decision = await enforceRateLimits(
      subject({ phone, sessionId: 'session-fixed', ip: '10.9.1.1' }),
      now
    );

    expect(decision.refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'QR_SESSION',
    });
    // The 11th attempt rolled its earlier restaurant increment back.
    expect(counter.counts.get(restaurantKey)).toBe(RATE_LIMITS.QR_SESSION);
  });

  it('does not consume a later bucket when the restaurant bucket refuses', async () => {
    const counter = installCounter();

    for (let index = 0; index < RATE_LIMITS.RESTAURANT; index += 1) {
      const decision = await enforceRateLimits(
        subject({
          phone: `+6012345${String(index).padStart(4, '0')}`,
          sessionId: `session-${index}`,
          ip: `10.8.0.${index}`,
        }),
        now
      );
      expect(decision.allowed).toBe(true);
    }

    const decision = await enforceRateLimits(
      subject({
        phone: '+60123459999',
        sessionId: 'session-fresh',
        ip: '10.8.1.1',
      }),
      now
    );

    expect(decision.refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'RESTAURANT',
    });
    const sessionKeys = [...counter.counts.keys()].filter(
      (key) =>
        key.split('|')[1] === 'QR_SESSION' && key.includes('session-fresh')
    );
    expect(sessionKeys).toEqual([]);
  });
});

describe('enforceRateLimits — refusal contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
  });

  it('returns a positive, rounded retryAfterSeconds', async () => {
    installCounter();

    let decision = await enforceRateLimits(
      subject({ phone, sessionId: 'session-fixed' }),
      now
    );
    for (let index = 0; index <= RATE_LIMITS.QR_SESSION; index += 1) {
      decision = await enforceRateLimits(
        subject({ phone, sessionId: 'session-fixed' }),
        now
      );
    }

    expect(decision.allowed).toBe(false);
    expect(decision.refusal?.retryAfterSeconds).toBe(2670);
    expect(decision.refusal?.retryAfterSeconds).toBe(retryAfterSeconds(now));
    expect((decision.refusal?.retryAfterSeconds ?? 0) % 10).toBe(0);
  });

  it('applies the strictest limit to the per-restaurant unknown IP bucket', async () => {
    const counter = installCounter();

    for (let index = 0; index < STRICTEST_RATE_LIMIT; index += 1) {
      const decision = await enforceRateLimits(
        subject({
          phone,
          sessionId: `session-${index}`,
          ip: UNKNOWN_TRUSTED_IP,
        }),
        now
      );
      expect(decision.allowed).toBe(true);
    }

    const decision = await enforceRateLimits(
      subject({
        phone,
        sessionId: 'session-final',
        ip: UNKNOWN_TRUSTED_IP,
      }),
      now
    );

    expect(decision.refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'EDGE_IP',
      limit: STRICTEST_RATE_LIMIT,
    });

    const ipSubjects = [...counter.counts.keys()]
      .filter((key) => key.split('|')[1] === 'EDGE_IP')
      .map((key) => key.split('|')[2]);
    expect(ipSubjects).toEqual([`unknown:${restaurantId}`]);
  });

  it('scopes the unknown sentinel per restaurant (F-02)', async () => {
    const counter = installCounter();
    const otherRestaurantId = '550e8400-e29b-41d4-a716-446655440099';

    // Exhaust restaurant A's shared unknown bucket.
    for (let index = 0; index < STRICTEST_RATE_LIMIT; index += 1) {
      const decision = await enforceRateLimits(
        subject({
          restaurantId,
          phone: `+6012345${String(index).padStart(4, '0')}`,
          sessionId: `a-${index}`,
          ip: UNKNOWN_TRUSTED_IP,
        }),
        now
      );
      expect(decision.allowed).toBe(true);
    }

    const refused = await enforceRateLimits(
      subject({
        restaurantId,
        phone: '+60123459999',
        sessionId: 'a-final',
        ip: UNKNOWN_TRUSTED_IP,
      }),
      now
    );
    expect(refused.allowed).toBe(false);
    expect(refused.refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'EDGE_IP',
      limit: STRICTEST_RATE_LIMIT,
    });

    // Restaurant B has its own unknown bucket and is unaffected by A.
    const other = await enforceRateLimits(
      subject({
        restaurantId: otherRestaurantId,
        phone: '+60123458888',
        sessionId: 'b-1',
        ip: UNKNOWN_TRUSTED_IP,
      }),
      now
    );
    expect(other.allowed).toBe(true);

    const ipSubjects = [...counter.counts.keys()]
      .filter((key) => key.split('|')[1] === 'EDGE_IP')
      .map((key) => key.split('|')[2]);
    expect(ipSubjects).toEqual(
      expect.arrayContaining([
        `unknown:${restaurantId}`,
        `unknown:${otherRestaurantId}`,
      ])
    );
  });
});

describe('enforceRateLimits — fail open', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
  });

  it('allows the request and never throws when the counter database fails', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Error('connection refused')
    );

    const decision = await enforceRateLimits(subject({ phone }), now);

    expect(decision).toEqual({
      allowed: true,
      refusal: null,
      failedOpen: true,
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).not.toContain(phone);
    log.mockRestore();
  });
});
