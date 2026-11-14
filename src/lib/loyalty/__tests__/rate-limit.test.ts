import { prisma } from '@/lib/database';
import {
  enforceRateLimits,
  incrementRateLimit,
  RATE_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  retryAfterSeconds,
  STRICTEST_RATE_LIMIT,
  windowStart,
  type RateLimitSubjectInput,
} from '@/lib/loyalty/rate-limit';
import { UNKNOWN_TRUSTED_IP } from '@/lib/loyalty/trusted-ip';

jest.mock('@/lib/database', () => ({
  prisma: { $queryRaw: jest.fn() },
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

  it('returns the seconds remaining in the window, rounded up', () => {
    // 10:15:30 → 11:00:00 is 44m30s.
    expect(retryAfterSeconds(now)).toBe(2670);
    expect(retryAfterSeconds(new Date('2026-11-14T10:59:59.500Z'))).toBe(1);
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
        ...overrides,
      }),
      now
    );
  }

  it('allows 30 per restaurant per hour and refuses the 31st', async () => {
    installCounter();

    for (let index = 0; index < RATE_LIMITS.RESTAURANT; index += 1) {
      await expect(attempt(index, {})).resolves.toBeNull();
    }

    const refusal = await attempt(RATE_LIMITS.RESTAURANT, {});
    expect(refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'RESTAURANT',
      limit: 30,
      count: 31,
    });
  });

  it('allows 10 per QR session per hour and refuses the 11th', async () => {
    installCounter();

    for (let index = 0; index < RATE_LIMITS.QR_SESSION; index += 1) {
      await expect(
        attempt(index, { sessionId: 'session-fixed' })
      ).resolves.toBeNull();
    }

    const refusal = await attempt(RATE_LIMITS.QR_SESSION, {
      sessionId: 'session-fixed',
    });
    expect(refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'QR_SESSION',
      limit: 10,
      count: 11,
    });
  });

  it('allows 20 per trusted edge IP per hour and refuses the 21st', async () => {
    installCounter();

    for (let index = 0; index < RATE_LIMITS.EDGE_IP; index += 1) {
      await expect(attempt(index, { ip: '198.51.100.20' })).resolves.toBeNull();
    }

    const refusal = await attempt(RATE_LIMITS.EDGE_IP, {
      ip: '198.51.100.20',
    });
    expect(refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'EDGE_IP',
      limit: 20,
      count: 21,
    });
  });

  it('allows 10 per phoneHash per hour and refuses the 11th', async () => {
    installCounter();

    for (let index = 0; index < RATE_LIMITS.PHONE_HASH; index += 1) {
      await expect(attempt(index, { phone })).resolves.toBeNull();
    }

    const refusal = await attempt(RATE_LIMITS.PHONE_HASH, { phone });
    expect(refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'PHONE_HASH',
      limit: 10,
      count: 11,
    });
  });

  it('does not create a phoneHash bucket when no phone is supplied', async () => {
    const counter = installCounter();

    await enforceRateLimits(subject({ phone: null }), now);

    const scopes = [...counter.counts.keys()].map((key) => key.split('|')[1]);
    expect(scopes).not.toContain('PHONE_HASH');
    expect(scopes).toEqual(
      expect.arrayContaining(['RESTAURANT', 'QR_SESSION', 'EDGE_IP'])
    );
  });

  it('does not create a phoneHash bucket for an invalid phone', async () => {
    const counter = installCounter();

    await enforceRateLimits(subject({ phone: 'not-a-phone' }), now);

    const scopes = [...counter.counts.keys()].map((key) => key.split('|')[1]);
    expect(scopes).not.toContain('PHONE_HASH');
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

  it('returns a positive retryAfterSeconds equal to the window end', async () => {
    installCounter();

    let refusal = null;
    for (let index = 0; index <= RATE_LIMITS.QR_SESSION; index += 1) {
      refusal = await enforceRateLimits(
        subject({ sessionId: 'session-fixed' }),
        now
      );
    }

    expect(refusal).not.toBeNull();
    expect(refusal?.retryAfterSeconds).toBe(2670);
    expect(refusal?.retryAfterSeconds).toBeGreaterThan(0);
    expect(refusal?.retryAfterSeconds).toBe(retryAfterSeconds(now));
  });

  it('applies the strictest limit to the shared unknown IP bucket', async () => {
    installCounter();

    for (let index = 0; index < STRICTEST_RATE_LIMIT; index += 1) {
      await expect(
        enforceRateLimits(
          subject({
            sessionId: `session-${index}`,
            ip: UNKNOWN_TRUSTED_IP,
          }),
          now
        )
      ).resolves.toBeNull();
    }

    const refusal = await enforceRateLimits(
      subject({ sessionId: 'session-final', ip: UNKNOWN_TRUSTED_IP }),
      now
    );

    expect(refusal).toMatchObject({
      code: 'RATE_LIMITED',
      scope: 'EDGE_IP',
      limit: STRICTEST_RATE_LIMIT,
    });
  });
});
