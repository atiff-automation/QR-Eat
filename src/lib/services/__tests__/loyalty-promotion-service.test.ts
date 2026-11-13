import { prisma } from '@/lib/database';
import {
  createPromotion,
  deletePromotion,
  listPromotions,
  PromotionInputSchema,
  PromotionPatchSchema,
  PromotionValidationError,
  updatePromotion,
} from '@/lib/services/loyalty-promotion-service';
import { stableRequestHash } from '@/lib/services/loyalty-owner-idempotency';

jest.mock('@/lib/database', () => ({ prisma: {} }));

const prismaMock = prisma as unknown as {
  restaurant: { findUnique: jest.Mock };
  promotion: { findMany: jest.Mock };
  orderActionReceipt: { findUnique: jest.Mock; delete: jest.Mock };
  $transaction: jest.Mock;
};

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const categoryId = '11111111-1111-4111-8111-111111111111';
const itemId1 = '22222222-2222-4222-8222-222222222222';
const itemId2 = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-11-13T10:00:00.000Z');

function makeTx() {
  return {
    orderActionReceipt: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'promo-1' }]),
    promotion: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    promotionCategory: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    promotionItem: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    menuCategory: { findMany: jest.fn() },
    menuItem: { findMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

function promotionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo-1',
    restaurantId,
    name: 'Old promotion',
    receiptLabel: 'OLD',
    type: 'ITEM',
    value: '10.00',
    scope: 'ITEM',
    minSpend: '0.00',
    maxDiscount: '15.00',
    startsAt: new Date('2026-11-01T00:00:00.000Z'),
    endsAt: new Date('2026-12-01T00:00:00.000Z'),
    isActive: true,
    deletedAt: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    promotionCategories: [],
    promotionItems: [{ itemId: itemId1 }],
    ...overrides,
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return PromotionInputSchema.parse({
    name: 'Lunch 20%',
    receiptLabel: 'Lunch 20%',
    type: 'PERCENT',
    value: '20.00',
    scope: 'CATEGORY',
    categoryIds: [categoryId],
    minSpend: '0.00',
    maxDiscount: '15.00',
    startsAt: '2026-11-01',
    endsAt: '2026-12-31',
    ...overrides,
  });
}

describe('loyalty promotion service', () => {
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = makeTx();

    prismaMock.restaurant = {
      findUnique: jest.fn().mockResolvedValue({
        timezone: 'Asia/Kuala_Lumpur',
      }),
    };
    prismaMock.promotion = { findMany: jest.fn().mockResolvedValue([]) };
    prismaMock.orderActionReceipt = {
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    };
    prismaMock.$transaction = jest.fn(
      async (callback: (client: unknown) => unknown) => callback(tx)
    );

    tx.menuCategory.findMany.mockResolvedValue([{ id: categoryId }]);
    tx.menuItem.findMany.mockResolvedValue([{ id: itemId1 }, { id: itemId2 }]);
    tx.promotion.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'promo-new',
        ...data,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      })
    );
    tx.promotion.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...promotionRow(),
        ...data,
        updatedAt: now,
      })
    );
  });

  it('creates a CATEGORY promotion and writes category join rows', async () => {
    const result = await createPromotion({
      restaurantId,
      userId: 'user-1',
      userType: 'restaurant_owner',
      input: createInput(),
      idempotencyKey: 'key-1',
    });

    expect(tx.promotion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        restaurantId,
        name: 'Lunch 20%',
        scope: 'CATEGORY',
        value: '20.00',
        createdBy: 'user-1',
      }),
    });
    expect(tx.promotionCategory.createMany).toHaveBeenCalledWith({
      data: [{ restaurantId, promotionId: 'promo-new', categoryId }],
    });
    expect(tx.promotionItem.createMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'promotions',
        recordId: 'promo-new',
        operation: 'CREATE',
      }),
    });
    expect(result.promotion.categoryIds).toEqual([categoryId]);
    expect(result.promotion.itemIds).toEqual([]);
    expect(result.statusCode).toBe(201);
  });

  it('creates an ITEM promotion and writes item join rows', async () => {
    await createPromotion({
      restaurantId,
      userId: 'user-1',
      input: createInput({
        scope: 'ITEM',
        categoryIds: undefined,
        itemIds: [itemId1, itemId2],
      }),
      idempotencyKey: 'key-2',
    });

    expect(tx.promotionItem.createMany).toHaveBeenCalledWith({
      data: [
        { restaurantId, promotionId: 'promo-new', itemId: itemId1 },
        { restaurantId, promotionId: 'promo-new', itemId: itemId2 },
      ],
    });
    expect(tx.promotionCategory.createMany).not.toHaveBeenCalled();
  });

  it('creates an ORDER promotion with no scope rows', async () => {
    await createPromotion({
      restaurantId,
      userId: 'user-1',
      input: createInput({
        scope: 'ORDER',
        categoryIds: undefined,
        itemIds: undefined,
      }),
      idempotencyKey: 'key-3',
    });

    expect(tx.promotionCategory.createMany).not.toHaveBeenCalled();
    expect(tx.promotionItem.createMany).not.toHaveBeenCalled();
  });

  it('returns a clean 400 when a category id belongs to another restaurant', async () => {
    tx.menuCategory.findMany.mockResolvedValue([]);

    await expect(
      createPromotion({
        restaurantId,
        userId: 'user-1',
        input: createInput(),
        idempotencyKey: 'key-4',
      })
    ).rejects.toMatchObject({
      name: 'PromotionValidationError',
      code: 'PROMOTION_INVALID',
      statusCode: 400,
    });

    expect(tx.promotion.create).not.toHaveBeenCalled();
  });

  it('returns a clean 400 when an item id belongs to another restaurant', async () => {
    tx.menuItem.findMany.mockResolvedValue([]);

    await expect(
      createPromotion({
        restaurantId,
        userId: 'user-1',
        input: createInput({
          scope: 'ITEM',
          categoryIds: undefined,
          itemIds: [itemId1],
        }),
        idempotencyKey: 'key-4b',
      })
    ).rejects.toMatchObject({
      name: 'PromotionValidationError',
      code: 'PROMOTION_INVALID',
      statusCode: 400,
    });

    expect(tx.promotion.create).not.toHaveBeenCalled();
  });

  it('rewrites scope rows delete-then-insert under a row lock', async () => {
    tx.promotion.findFirst.mockResolvedValue(promotionRow());
    tx.menuItem.findMany.mockResolvedValue([{ id: itemId2 }]);

    await updatePromotion({
      restaurantId,
      promotionId: 'promo-1',
      userId: 'user-2',
      patch: PromotionPatchSchema.parse({ itemIds: [itemId2] }),
      idempotencyKey: 'key-5',
    });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.promotionCategory.deleteMany).toHaveBeenCalledWith({
      where: { restaurantId, promotionId: 'promo-1' },
    });
    expect(tx.promotionItem.deleteMany).toHaveBeenCalledWith({
      where: { restaurantId, promotionId: 'promo-1' },
    });
    expect(tx.promotionItem.createMany).toHaveBeenCalledWith({
      data: [{ restaurantId, promotionId: 'promo-1', itemId: itemId2 }],
    });

    const deleteOrder = (tx.promotionItem.deleteMany as jest.Mock).mock
      .invocationCallOrder[0];
    const insertOrder = (tx.promotionItem.createMany as jest.Mock).mock
      .invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(insertOrder);
  });

  it('soft-deletes a promotion without hard-deleting scope rows', async () => {
    tx.promotion.findFirst.mockResolvedValue(promotionRow());

    const result = await deletePromotion({
      restaurantId,
      promotionId: 'promo-1',
      userId: 'user-3',
      idempotencyKey: 'key-6',
    });

    expect(tx.promotion.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: {
        deletedAt: expect.any(Date),
        isActive: false,
        updatedBy: 'user-3',
      },
    });
    expect(tx.promotionCategory.deleteMany).not.toHaveBeenCalled();
    expect(tx.promotionItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'promotions',
        recordId: 'promo-1',
        operation: 'DELETE',
      }),
    });
    expect(result.promotion.deletedAt).not.toBeNull();
  });

  it('excludes soft-deleted promotions from the list', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([promotionRow()]);

    await listPromotions({ restaurantId });

    expect(prismaMock.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ restaurantId, deletedAt: null }),
      })
    );
  });

  it('applies the scope and status list filters', async () => {
    await listPromotions({
      restaurantId,
      filters: { scope: 'ITEM', status: 'active' },
      now,
    });

    expect(prismaMock.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          restaurantId,
          deletedAt: null,
          scope: 'ITEM',
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      })
    );
  });

  it('stores a date-only endsAt as restaurant-local end of day', async () => {
    await createPromotion({
      restaurantId,
      userId: 'user-1',
      input: createInput({
        scope: 'ORDER',
        categoryIds: undefined,
        startsAt: '2026-12-01',
        endsAt: '2026-12-31',
      }),
      idempotencyKey: 'key-7',
    });

    const data = (tx.promotion.create as jest.Mock).mock.calls[0][0].data;
    // Asia/Kuala_Lumpur is UTC+8.
    expect(data.startsAt.toISOString()).toBe('2026-11-30T16:00:00.000Z');
    expect(data.endsAt.toISOString()).toBe('2026-12-31T15:59:59.999Z');
  });

  it('rejects endsAt that is not after startsAt', async () => {
    await expect(
      createPromotion({
        restaurantId,
        userId: 'user-1',
        input: createInput({
          startsAt: '2026-12-31',
          endsAt: '2026-12-01',
        }),
        idempotencyKey: 'key-8',
      })
    ).rejects.toBeInstanceOf(PromotionValidationError);

    expect(tx.promotion.create).not.toHaveBeenCalled();
  });

  it('rejects a PERCENT promotion above 100', async () => {
    const input = { ...createInput(), value: '101.00' };

    await expect(
      createPromotion({
        restaurantId,
        userId: 'user-1',
        input,
        idempotencyKey: 'key-9',
      })
    ).rejects.toBeInstanceOf(PromotionValidationError);
  });

  it('replays a completed create receipt for the same key and body', async () => {
    const input = createInput();
    const requestHash = stableRequestHash({ restaurantId, input });
    prismaMock.orderActionReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      createdAt: new Date(),
      response: {
        requestHash,
        statusCode: 201,
        body: { promotion: { id: 'promo-existing' } },
      },
    });

    const result = await createPromotion({
      restaurantId,
      userId: 'user-1',
      input,
      idempotencyKey: 'key-10',
    });

    expect(result.replayed).toBe(true);
    expect(result.promotion).toEqual({ id: 'promo-existing' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
