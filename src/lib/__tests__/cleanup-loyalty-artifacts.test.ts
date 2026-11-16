import { prisma } from '@/lib/database';
import {
  cleanupExpiredIdempotencyRecords,
  cleanupExpiredQuotes,
  cleanupLoyaltyArtifacts,
  QUOTE_RETENTION_MS,
} from '@/lib/jobs/cleanup-loyalty-artifacts';

jest.mock('@/lib/database', () => ({
  prisma: {
    quote: { deleteMany: jest.fn() },
    idempotencyRecord: { deleteMany: jest.fn() },
  },
}));

const prismaMock = prisma as unknown as {
  quote: { deleteMany: jest.Mock };
  idempotencyRecord: { deleteMany: jest.Mock };
};

const now = new Date('2026-11-16T12:00:00.000Z');

describe('cleanup-loyalty-artifacts (D-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.quote.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.idempotencyRecord.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('deletes quotes whose expiry is older than the 24-hour retention window', async () => {
    prismaMock.quote.deleteMany.mockResolvedValue({ count: 3 });

    const deleted = await cleanupExpiredQuotes(now);

    expect(deleted).toBe(3);
    expect(prismaMock.quote.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: {
          lt: new Date(now.getTime() - QUOTE_RETENTION_MS),
        },
      },
    });
  });

  it('deletes idempotency records past their own expiresAt', async () => {
    prismaMock.idempotencyRecord.deleteMany.mockResolvedValue({ count: 5 });

    const deleted = await cleanupExpiredIdempotencyRecords(now);

    expect(deleted).toBe(5);
    expect(prismaMock.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });

  it('runs both prunes and reports both counts', async () => {
    prismaMock.quote.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.idempotencyRecord.deleteMany.mockResolvedValue({ count: 4 });

    await expect(cleanupLoyaltyArtifacts(now)).resolves.toEqual({
      deletedQuotes: 2,
      deletedIdempotencyRecords: 4,
    });
  });
});
