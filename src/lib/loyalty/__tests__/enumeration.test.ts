import { prisma } from '@/lib/database';
import {
  ENUMERATION_ALERT_EVENT,
  ENUMERATION_WINDOW_MS,
  LOOKUP_MISS_EVENT,
  RATE_LIMITED_EVENT,
  RATE_LIMIT_UNAVAILABLE_EVENT,
  recordLoyaltyLookupMiss,
  recordRateLimited,
  recordRateLimitUnavailable,
} from '@/lib/loyalty/enumeration';

jest.mock('@/lib/database', () => ({
  prisma: {
    securityEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

interface SecurityRow {
  id: string;
  restaurantId?: string | null;
  eventType: string;
  severity: string;
  ipAddress: string;
  requestPath?: string;
  eventData: unknown;
  createdAt: Date;
}

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const otherRestaurantId = '550e8400-e29b-41d4-a716-446655440099';
const ip = '203.0.113.9';
const now = new Date('2026-11-14T10:15:00.000Z');

let rows: SecurityRow[] = [];

function alerts(): SecurityRow[] {
  return rows.filter((row) => row.eventType === ENUMERATION_ALERT_EVENT);
}

function misses(): SecurityRow[] {
  return rows.filter((row) => row.eventType === LOOKUP_MISS_EVENT);
}

function refusals(): SecurityRow[] {
  return rows.filter((row) => row.eventType === RATE_LIMITED_EVENT);
}

function miss(
  phoneHash: string,
  at: Date = now,
  address: string = ip,
  restaurant: string = restaurantId
): Promise<void> {
  return recordLoyaltyLookupMiss({
    restaurantId: restaurant,
    ip: address,
    phoneHash,
    requestPath: '/api/qr/orders/quote',
    now: at,
  });
}

function eventDataValue(row: SecurityRow, key: string): unknown {
  const data = row.eventData;
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return undefined;
  return (data as Record<string, unknown>)[key];
}

/**
 * A minimal in-memory filter for the fields the module queries: event type,
 * restaurant, IP, `createdAt >=` and the `eventData` JSON path equality.
 */
function matchesWhere(
  row: SecurityRow,
  where: Record<string, unknown>
): boolean {
  if (where.eventType !== undefined && row.eventType !== where.eventType) {
    return false;
  }
  if (
    where.restaurantId !== undefined &&
    row.restaurantId !== where.restaurantId
  ) {
    return false;
  }
  if (where.ipAddress !== undefined && row.ipAddress !== where.ipAddress) {
    return false;
  }
  const createdAt = where.createdAt as { gte?: Date } | undefined;
  if (createdAt?.gte && row.createdAt.getTime() < createdAt.gte.getTime()) {
    return false;
  }
  const eventData = where.eventData as
    | { path?: string[]; equals?: unknown }
    | undefined;
  if (eventData?.path && eventData.path.length === 1) {
    return eventDataValue(row, eventData.path[0]) === eventData.equals;
  }
  return true;
}

beforeEach(() => {
  jest.clearAllMocks();
  rows = [];

  (prisma.securityEvent.create as jest.Mock).mockImplementation(
    async ({ data }: { data: Omit<SecurityRow, 'id'> }) => {
      const row = { id: `evt-${rows.length + 1}`, ...data };
      rows.push(row);
      return row;
    }
  );

  (prisma.securityEvent.findMany as jest.Mock).mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) =>
      rows
        .filter((row) => matchesWhere(row, where))
        .map((row) => ({ eventData: row.eventData }))
  );

  (prisma.securityEvent.findFirst as jest.Mock).mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      const found = rows.find((row) => matchesWhere(row, where));
      return found ? { id: found.id } : null;
    }
  );

  (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (client: typeof prisma) => unknown) => callback(prisma)
  );
});

describe('recordLoyaltyLookupMiss', () => {
  it('records every miss as a tenant-scoped info event with the phone hash only', async () => {
    const phoneHash = 'a'.repeat(64);
    await miss(phoneHash);

    expect(misses()).toHaveLength(1);
    expect(misses()[0]).toMatchObject({
      restaurantId,
      eventType: LOOKUP_MISS_EVENT,
      severity: 'info',
      ipAddress: ip,
      requestPath: '/api/qr/orders/quote',
      eventData: { phoneHash },
    });
    expect(alerts()).toHaveLength(0);
  });

  it('does not alert before five distinct misses', async () => {
    for (let index = 0; index < 4; index += 1) {
      await miss(`hash-${index}`);
    }

    expect(misses()).toHaveLength(4);
    expect(alerts()).toHaveLength(0);
  });

  it('writes exactly one warning alert at five distinct misses', async () => {
    for (let index = 0; index < 5; index += 1) {
      await miss(`hash-${index}`);
    }

    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({
      restaurantId,
      eventType: ENUMERATION_ALERT_EVENT,
      severity: 'warning',
      ipAddress: ip,
      eventData: { distinctPhoneHashes: 5 },
    });
  });

  it('does not duplicate the alert for a sixth distinct miss in the window', async () => {
    for (let index = 0; index < 5; index += 1) {
      await miss(`hash-${index}`);
    }
    await miss('hash-5');

    expect(misses()).toHaveLength(6);
    expect(alerts()).toHaveLength(1);
  });

  it('counts distinct hashes, not repeated lookups of one hash', async () => {
    for (let index = 0; index < 5; index += 1) {
      await miss('same-hash');
    }

    expect(misses()).toHaveLength(5);
    expect(alerts()).toHaveLength(0);
  });

  it('ignores misses older than the ten-minute window', async () => {
    const old = new Date(now.getTime() - ENUMERATION_WINDOW_MS - 1000);
    for (let index = 0; index < 5; index += 1) {
      rows.push({
        id: `old-${index}`,
        restaurantId,
        eventType: LOOKUP_MISS_EVENT,
        severity: 'info',
        ipAddress: ip,
        requestPath: '/api/qr/orders/quote',
        eventData: { phoneHash: `old-${index}` },
        createdAt: old,
      });
    }

    await miss('fresh-hash');

    expect(alerts()).toHaveLength(0);
  });

  it('keeps one IP from suppressing another IP alert', async () => {
    for (let index = 0; index < 5; index += 1) {
      await miss(`ip-a-${index}`, now, '203.0.113.9');
    }
    for (let index = 0; index < 5; index += 1) {
      await miss(`ip-b-${index}`, now, '203.0.113.10');
    }

    expect(alerts()).toHaveLength(2);
    expect(
      alerts()
        .map((row) => row.ipAddress)
        .sort()
    ).toEqual(['203.0.113.10', '203.0.113.9']);
  });

  it('scopes the alert by restaurant, so one venue cannot trip another (M-3)', async () => {
    for (let index = 0; index < 5; index += 1) {
      await miss(`a-${index}`, now, ip, restaurantId);
    }
    for (let index = 0; index < 5; index += 1) {
      await miss(`b-${index}`, now, ip, otherRestaurantId);
    }

    expect(alerts()).toHaveLength(2);
    expect(
      alerts()
        .map((row) => row.restaurantId)
        .sort()
    ).toEqual([restaurantId, otherRestaurantId].sort());
  });

  it('never writes a raw phone number to an event', async () => {
    const phone = '+60123456789';
    for (let index = 0; index < 5; index += 1) {
      await miss(String(index).padStart(64, 'b'));
    }

    expect(JSON.stringify(rows)).not.toContain(phone);
    for (const row of rows) {
      const data = row.eventData as Record<string, unknown>;
      expect(Object.keys(data)).not.toContain('phone');
    }
  });
});

describe('recordRateLimited', () => {
  const phoneHash = 'c'.repeat(64);

  it('writes one tenant-scoped warning event with the bucket subject', async () => {
    await recordRateLimited({
      restaurantId,
      scope: 'PHONE_HASH',
      subject: phoneHash,
      ip,
      now,
    });

    expect(refusals()).toHaveLength(1);
    expect(refusals()[0]).toMatchObject({
      restaurantId,
      eventType: RATE_LIMITED_EVENT,
      severity: 'warning',
      ipAddress: ip,
      eventData: { scope: 'PHONE_HASH', subject: phoneHash },
    });
  });

  it('dedupes a burst to one event per subject and hourly window', async () => {
    for (let index = 0; index < 20; index += 1) {
      await recordRateLimited({
        restaurantId,
        scope: 'PHONE_HASH',
        subject: phoneHash,
        ip,
        now,
      });
    }

    expect(refusals()).toHaveLength(1);
  });

  it('writes a separate event for a different subject in the same window', async () => {
    await recordRateLimited({
      restaurantId,
      scope: 'PHONE_HASH',
      subject: phoneHash,
      ip,
      now,
    });
    await recordRateLimited({
      restaurantId,
      scope: 'EDGE_IP',
      subject: ip,
      ip,
      now,
    });

    expect(refusals()).toHaveLength(2);
  });

  it('writes a new event in the next hourly window', async () => {
    await recordRateLimited({
      restaurantId,
      scope: 'PHONE_HASH',
      subject: phoneHash,
      ip,
      now,
    });
    await recordRateLimited({
      restaurantId,
      scope: 'PHONE_HASH',
      subject: phoneHash,
      ip,
      now: new Date('2026-11-14T11:00:01.000Z'),
    });

    expect(refusals()).toHaveLength(2);
  });

  it('never stores a raw phone number', async () => {
    const phone = '+60123456789';
    await recordRateLimited({
      restaurantId,
      scope: 'PHONE_HASH',
      subject: phone,
      ip,
      now,
    });

    expect(refusals()).toHaveLength(0);
    expect(JSON.stringify(rows)).not.toContain(phone);
  });

  it('swallows a storage failure', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Error('database down')
    );

    await expect(
      recordRateLimited({
        restaurantId,
        scope: 'PHONE_HASH',
        subject: phoneHash,
        ip,
        now,
      })
    ).resolves.toBeUndefined();
  });
});

describe('recordRateLimitUnavailable', () => {
  it('records one warning per restaurant and window, not a refusal', async () => {
    for (let index = 0; index < 5; index += 1) {
      await recordRateLimitUnavailable({ restaurantId, ip, now });
    }

    const unavailable = rows.filter(
      (row) => row.eventType === RATE_LIMIT_UNAVAILABLE_EVENT
    );
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]).toMatchObject({
      restaurantId,
      severity: 'warning',
      eventData: { reason: 'counter_unavailable' },
    });
    expect(refusals()).toHaveLength(0);
  });
});
