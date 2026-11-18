import {
  recordRestaurantChange,
  recordRestaurantChangeTx,
} from '@/lib/restaurant-changes';

jest.mock('@/lib/database', () => ({
  prisma: { restaurantChange: { create: jest.fn() } },
}));

const input = {
  restaurantId: 'restaurant-1',
  entityType: 'order' as const,
  entityId: 'order-1',
};

describe('restaurant change feed writers', () => {
  it('writes the B3 row through the supplied transaction', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { restaurantChange: { create } } as never;

    await recordRestaurantChangeTx(tx, input);

    expect(create).toHaveBeenCalledWith({
      data: {
        restaurantId: 'restaurant-1',
        entityType: 'order',
        entityId: 'order-1',
        operation: 'upsert',
      },
    });
  });

  it('throws on a failed in-transaction row so the mutation rolls back', async () => {
    const tx = {
      restaurantChange: {
        create: jest.fn().mockRejectedValue(new Error('insert failed')),
      },
    } as never;

    await expect(recordRestaurantChangeTx(tx, input)).rejects.toThrow(
      'insert failed'
    );
  });

  it('keeps the best-effort writer for other callers', async () => {
    const { prisma } = jest.requireMock('@/lib/database');
    (prisma.restaurantChange.create as jest.Mock).mockRejectedValue(
      new Error('insert failed')
    );
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(recordRestaurantChange(input)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
