import { prisma } from '@/lib/database';
import { hashNoticeText } from '@/lib/loyalty/consent';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
  LoyaltySettingsPatchSchema,
  LoyaltySettingsValidationError,
} from '@/lib/services/loyalty-settings-service';
import { OwnerIdempotencyMismatchError } from '@/lib/services/loyalty-owner-idempotency';

jest.mock('@/lib/database', () => ({ prisma: {} }));

const prismaMock = prisma as unknown as {
  loyaltySettings: { findUnique: jest.Mock };
  orderActionReceipt: { findUnique: jest.Mock; delete: jest.Mock };
  $transaction: jest.Mock;
};

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

const existingRow = {
  id: 'settings-1',
  restaurantId,
  enabled: true,
  visitsRequired: 4,
  lookupLimitPerHour: 30,
  rewardType: 'PERCENT' as const,
  rewardValue: '10.00',
  maxDiscount: '15.00',
  minDailySpend: '20.00',
  rewardLabel: '10% off, max RM15',
  termsText: null,
  receiptLabel: null,
  privacyUrl: 'https://example.test/privacy',
  noticeVersion: 'v1',
  noticeText: 'Old notice',
  noticeTextHash: hashNoticeText('Old notice'),
  updatedBy: 'user-1',
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
};

function makeTx() {
  return {
    orderActionReceipt: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    loyaltySettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    loyaltyCard: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

describe('loyalty settings service', () => {
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = makeTx();

    prismaMock.loyaltySettings = { findUnique: jest.fn() };
    prismaMock.orderActionReceipt = {
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    };
    prismaMock.$transaction = jest.fn(
      async (callback: (client: unknown) => unknown) => callback(tx)
    );

    tx.loyaltySettings.findUnique.mockResolvedValue(null);
    tx.loyaltySettings.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'settings-new',
        ...data,
        updatedAt: new Date('2026-11-13T00:00:00.000Z'),
      })
    );
    tx.loyaltySettings.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...existingRow,
        ...data,
        updatedAt: new Date('2026-11-13T00:00:00.000Z'),
      })
    );
  });

  it('returns safe defaults while no settings row exists', async () => {
    prismaMock.loyaltySettings.findUnique.mockResolvedValue(null);

    const settings = await getLoyaltySettings(restaurantId);

    expect(settings).toMatchObject({
      enabled: false,
      visitsRequired: 3,
      lookupLimitPerHour: 30,
      rewardType: 'PERCENT',
      rewardValue: '10.00',
      maxDiscount: '15.00',
      minDailySpend: '20.00',
      rewardLabel: '10% off',
      noticeTextHash: null,
      updatedBy: null,
      updatedAt: null,
    });
  });

  it('uses a currency-neutral default reward label (L-06)', async () => {
    prismaMock.loyaltySettings.findUnique.mockResolvedValue(null);

    const settings = await getLoyaltySettings(restaurantId);

    expect(settings.rewardLabel).toBe('10% off');
    expect(settings.rewardLabel).not.toMatch(/\b(MYR|RM|USD|SGD|EUR)\b/);
    expect(settings.maxDiscount).toBe('15.00');
  });

  it('derives noticeTextHash server-side and ignores a client-sent hash', async () => {
    const result = await updateLoyaltySettings({
      restaurantId,
      userId: 'user-1',
      userType: 'restaurant_owner',
      patch: {
        noticeVersion: 'v2',
        noticeText: '  New notice  ',
        // The schema strips this; it must never reach the database.
        noticeTextHash: 'client-supplied',
      } as never,
      idempotencyKey: 'key-1',
    });

    expect(tx.loyaltySettings.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        restaurantId,
        noticeVersion: 'v2',
        noticeText: 'New notice',
        noticeTextHash: hashNoticeText('New notice'),
        enabled: false,
        visitsRequired: 3,
        minDailySpend: '20.00',
      }),
    });
    expect(result.settings.noticeTextHash).toBe(hashNoticeText('New notice'));
    expect(result.settings.noticeTextHash).not.toBe('client-supplied');
  });

  it('stores the owner-set restaurant lookup ceiling', async () => {
    const result = await updateLoyaltySettings({
      restaurantId,
      userId: 'user-1',
      patch: { lookupLimitPerHour: 120 },
      idempotencyKey: 'key-lookup',
    });

    expect(tx.loyaltySettings.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lookupLimitPerHour: 120 }),
    });
    expect(result.settings.lookupLimitPerHour).toBe(120);
  });

  it.each([
    { visitsRequired: 11 },
    { visitsRequired: 1 },
    { lookupLimitPerHour: 0 },
    { lookupLimitPerHour: 1001 },
    { lookupLimitPerHour: 30.5 },
    { minDailySpend: '1000.01' },
    { minDailySpend: '-1.00' },
    { receiptLabel: 'Café' },
    { rewardLabel: 'x'.repeat(25) },
    { rewardValue: '10.001' },
  ])('rejects an out-of-bounds patch %j', (patch) => {
    expect(LoyaltySettingsPatchSchema.safeParse(patch).success).toBe(false);
  });

  it('rejects a PERCENT reward above 100 after merging with the existing rule', async () => {
    tx.loyaltySettings.findUnique.mockResolvedValue(existingRow);

    await expect(
      updateLoyaltySettings({
        restaurantId,
        userId: 'user-1',
        patch: { rewardType: 'PERCENT', rewardValue: '101.00' },
        idempotencyKey: 'key-2',
      })
    ).rejects.toBeInstanceOf(LoyaltySettingsValidationError);

    expect(tx.loyaltySettings.update).not.toHaveBeenCalled();
  });

  it('does not rewrite an in-progress card snapshot', async () => {
    tx.loyaltySettings.findUnique.mockResolvedValue(existingRow);

    await updateLoyaltySettings({
      restaurantId,
      userId: 'user-1',
      patch: { visitsRequired: 5, rewardLabel: 'Five visits' },
      idempotencyKey: 'key-3',
    });

    expect(tx.loyaltySettings.update).toHaveBeenCalledTimes(1);
    expect(tx.loyaltyCard.update).not.toHaveBeenCalled();
    expect(tx.loyaltyCard.updateMany).not.toHaveBeenCalled();
  });

  it('updates settings while the global loyalty flag is off', async () => {
    const original = process.env.LOYALTY_ENABLED;
    process.env.LOYALTY_ENABLED = 'false';
    try {
      const result = await updateLoyaltySettings({
        restaurantId,
        userId: 'user-1',
        patch: {
          enabled: true,
          visitsRequired: 4,
          noticeVersion: 'v1',
          noticeText: 'Rewards notice',
          privacyUrl: 'https://example.test/privacy',
        },
        idempotencyKey: 'key-flag-off',
      });

      expect(result.settings.enabled).toBe(true);
      expect(result.settings.visitsRequired).toBe(4);
    } finally {
      if (original === undefined) {
        delete process.env.LOYALTY_ENABLED;
      } else {
        process.env.LOYALTY_ENABLED = original;
      }
    }
  });

  it('rejects enabled=true when the notice is incomplete', async () => {
    await expect(
      updateLoyaltySettings({
        restaurantId,
        userId: 'user-1',
        patch: { enabled: true },
        idempotencyKey: 'key-notice-missing',
      })
    ).rejects.toMatchObject({
      name: 'LoyaltySettingsValidationError',
      code: 'INVALID_REQUEST',
      message: expect.stringContaining(
        'missing noticeVersion, noticeText, privacyUrl'
      ),
    });

    expect(tx.loyaltySettings.create).not.toHaveBeenCalled();
  });

  it('names only the notice fields that are actually missing', async () => {
    await expect(
      updateLoyaltySettings({
        restaurantId,
        userId: 'user-1',
        patch: {
          enabled: true,
          noticeText: 'Rewards notice',
        },
        idempotencyKey: 'key-notice-partial',
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('missing noticeVersion, privacyUrl'),
    });
  });

  it('allows enabled=false with an incomplete notice', async () => {
    const result = await updateLoyaltySettings({
      restaurantId,
      userId: 'user-1',
      patch: { enabled: false, noticeText: 'Rewards notice' },
      idempotencyKey: 'key-notice-disabled',
    });

    expect(result.settings.enabled).toBe(false);
    expect(tx.loyaltySettings.create).toHaveBeenCalled();
  });

  it('allows enabled=true once the notice is complete', async () => {
    const result = await updateLoyaltySettings({
      restaurantId,
      userId: 'user-1',
      patch: {
        enabled: true,
        noticeVersion: 'v1',
        noticeText: 'Rewards notice',
        privacyUrl: 'https://example.test/privacy',
      },
      idempotencyKey: 'key-notice-complete',
    });

    expect(result.settings.enabled).toBe(true);
    expect(result.settings.noticeTextHash).toBe(
      hashNoticeText('Rewards notice')
    );
  });

  it('writes the audit row in the same transaction as the settings change', async () => {
    tx.loyaltySettings.findUnique.mockResolvedValue(existingRow);

    await updateLoyaltySettings({
      restaurantId,
      userId: 'user-7',
      userType: 'restaurant_owner',
      patch: { enabled: false },
      idempotencyKey: 'key-4',
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'loyalty_settings',
        recordId: restaurantId,
        operation: 'UPDATE',
        changedBy: 'user-7',
        changedByType: 'restaurant_owner',
        restaurantId,
        category: 'loyalty',
      }),
    });
  });

  it('replays a completed receipt for the same key and request hash', async () => {
    const requestHash = (
      await import('@/lib/services/loyalty-owner-idempotency')
    ).stableRequestHash({
      restaurantId,
      patch: { enabled: true },
    });
    prismaMock.orderActionReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      createdAt: new Date(),
      response: {
        requestHash,
        statusCode: 200,
        body: { settings: { enabled: true } },
      },
    });

    const result = await updateLoyaltySettings({
      restaurantId,
      userId: 'user-1',
      patch: { enabled: true },
      idempotencyKey: 'key-5',
    });

    expect(result.replayed).toBe(true);
    expect(result.settings).toEqual({ enabled: true });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a reused key with a different request', async () => {
    prismaMock.orderActionReceipt.findUnique.mockResolvedValue({
      id: 'receipt-2',
      createdAt: new Date(),
      response: {
        requestHash: 'different-hash',
        statusCode: 200,
        body: { settings: { enabled: true } },
      },
    });

    await expect(
      updateLoyaltySettings({
        restaurantId,
        userId: 'user-1',
        patch: { enabled: false },
        idempotencyKey: 'key-6',
      })
    ).rejects.toBeInstanceOf(OwnerIdempotencyMismatchError);
  });
});
