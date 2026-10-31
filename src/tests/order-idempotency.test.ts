import { prisma } from '@/lib/database';
import {
  findReceipt,
  ORDER_ACTION,
  saveReceipt,
} from '@/lib/order-idempotency';

jest.mock('@/lib/database', () => ({
  prisma: {
    orderActionReceipt: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('order idempotency receipts', () => {
  beforeEach(() => {
    (prisma.orderActionReceipt.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.orderActionReceipt.create as jest.Mock).mockResolvedValue({
      statusCode: 200,
      response: { success: true },
    });
  });

  it('finds a stored response by restaurant, action and key', async () => {
    (prisma.orderActionReceipt.findUnique as jest.Mock).mockResolvedValue({
      statusCode: 200,
      response: { success: true },
    });

    await expect(
      findReceipt('restaurant-1', ORDER_ACTION.ORDER_READY, 'key-1')
    ).resolves.toEqual({
      statusCode: 200,
      body: { success: true },
    });
  });

  it('stores a response once', async () => {
    await expect(
      saveReceipt({
        restaurantId: 'restaurant-1',
        action: ORDER_ACTION.ORDER_READY,
        key: 'key-1',
        orderId: 'order-1',
        body: { success: true },
      })
    ).resolves.toEqual({
      statusCode: 200,
      body: { success: true },
    });
    expect(prisma.orderActionReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: 'restaurant-1',
          action: 'order.ready',
          idempotencyKey: 'key-1',
        }),
      })
    );
  });

  it('replays the winner when two requests race on the unique key', async () => {
    (prisma.orderActionReceipt.create as jest.Mock).mockRejectedValue({
      code: 'P2002',
    });
    (prisma.orderActionReceipt.findUnique as jest.Mock).mockResolvedValue({
      statusCode: 200,
      response: { success: true, replayed: true },
    });

    await expect(
      saveReceipt({
        restaurantId: 'restaurant-1',
        action: ORDER_ACTION.ITEM_STATUS,
        key: 'key-2',
        body: { success: true },
      })
    ).resolves.toEqual({
      statusCode: 200,
      body: { success: true, replayed: true },
    });
  });
});
