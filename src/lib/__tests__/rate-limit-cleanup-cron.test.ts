import { prisma } from '@/lib/database';
import {
  pruneRateLimitCounters,
  RATE_LIMIT_CLEANUP_INTERVAL_MS,
  RATE_LIMIT_RETENTION_MS,
  rateLimitCleanupCron,
  rateLimitCutoff,
  RateLimitCleanupCron,
} from '@/lib/rate-limit-cleanup-cron';

jest.mock('@/lib/database', () => ({
  prisma: { rateLimitCounter: { deleteMany: jest.fn() } },
}));

const now = new Date('2026-11-14T10:00:00.000Z');

interface CounterRow {
  id: string;
  windowStart: Date;
}

function installStore(rows: CounterRow[]) {
  (prisma.rateLimitCounter.deleteMany as jest.Mock).mockImplementation(
    async ({ where }: { where: { windowStart: { lt: Date } } }) => {
      const cutoff = where.windowStart.lt;
      const keep = rows.filter(
        (row) => row.windowStart.getTime() >= cutoff.getTime()
      );
      const deleted = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count: deleted };
    }
  );
}

describe('rate-limit cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retains 24 hours of windows', () => {
    expect(RATE_LIMIT_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
    expect(rateLimitCutoff(now).toISOString()).toBe('2026-11-13T10:00:00.000Z');
  });

  it('prunes only windows older than the retention cutoff', async () => {
    const old = {
      id: 'old',
      windowStart: new Date(now.getTime() - RATE_LIMIT_RETENTION_MS - 1000),
    };
    const boundary = {
      id: 'boundary',
      windowStart: new Date(now.getTime() - RATE_LIMIT_RETENTION_MS),
    };
    const fresh = {
      id: 'fresh',
      windowStart: new Date(now.getTime() - 60 * 60 * 1000),
    };
    const rows = [old, boundary, fresh];
    installStore(rows);

    const deleted = await pruneRateLimitCounters(now);

    expect(deleted).toBe(1);
    expect(rows.map((row) => row.id)).toEqual(['boundary', 'fresh']);
  });

  it('is idempotent and safe to run repeatedly', async () => {
    const rows = [
      {
        id: 'old',
        windowStart: new Date(now.getTime() - RATE_LIMIT_RETENTION_MS - 1000),
      },
    ];
    installStore(rows);

    await expect(pruneRateLimitCounters(now)).resolves.toBe(1);
    await expect(pruneRateLimitCounters(now)).resolves.toBe(0);
    await expect(pruneRateLimitCounters(now)).resolves.toBe(0);
  });

  it('swallows a database error and reports zero', async () => {
    (prisma.rateLimitCounter.deleteMany as jest.Mock).mockRejectedValue(
      new Error('database down')
    );

    await expect(rateLimitCleanupCron.triggerCleanup(now)).resolves.toBe(0);
  });

  it('starts once and stops cleanly', () => {
    const cron = new RateLimitCleanupCron();

    expect(cron.isActive()).toBe(false);
    cron.start();
    expect(cron.isActive()).toBe(true);
    // A second start must not create a second timer.
    cron.start();
    expect(cron.isActive()).toBe(true);
    cron.stop();
    expect(cron.isActive()).toBe(false);
  });

  it('runs on an hourly interval', () => {
    expect(RATE_LIMIT_CLEANUP_INTERVAL_MS).toBe(60 * 60 * 1000);
  });
});
