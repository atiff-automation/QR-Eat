import { prisma } from '@/lib/database';
import {
  clearRecallIfStationReady,
  hasActiveRecallForItem,
  isRecallWindowExpired,
  recallExpiresAt,
  stationItemIds,
} from '@/lib/recall';

jest.mock('@/lib/database', () => ({
  prisma: {
    orderEvent: { findMany: jest.fn() },
    order: { findUnique: jest.fn() },
    orderItem: { findMany: jest.fn() },
    stationOrderRecall: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/order-events', () => ({
  ORDER_EVENT_TYPES: {
    CREATED: 'order.created',
    ITEMS_ADDED: 'order.items.added',
  },
  resolveRouting: jest.fn(),
}));

describe('kitchen recall helpers', () => {
  beforeEach(() => {
    process.env.RECALL_WINDOW_MINUTES = '15';
  });

  afterEach(() => {
    delete process.env.RECALL_WINDOW_MINUTES;
  });

  it('uses the configured window and expires strictly after it', () => {
    const readyAt = new Date('2026-10-31T10:00:00.000Z');
    expect(recallExpiresAt(readyAt).toISOString()).toBe(
      '2026-10-31T10:15:00.000Z'
    );
    expect(
      isRecallWindowExpired(readyAt, new Date('2026-10-31T10:15:00.000Z'))
    ).toBe(false);
    expect(
      isRecallWindowExpired(readyAt, new Date('2026-10-31T10:15:00.001Z'))
    ).toBe(true);
  });

  it('reads station item ids from the printed ticket payload', async () => {
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      {
        payload: {
          items: [{ itemId: 'item-1' }, { itemId: 'item-2' }],
        },
      },
    ]);

    await expect(
      stationItemIds('order-1', 'restaurant-1', 'station-1')
    ).resolves.toEqual(['item-1', 'item-2']);
  });

  it('finds an active recall that owns the item', async () => {
    (prisma.stationOrderRecall.findMany as jest.Mock).mockResolvedValue([
      { restaurantId: 'restaurant-1', stationId: 'station-1' },
    ]);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { payload: { items: [{ itemId: 'item-1' }] } },
    ]);

    await expect(hasActiveRecallForItem('order-1', 'item-1')).resolves.toBe(
      true
    );
  });

  it('clears only when every station item is ready', async () => {
    (prisma.stationOrderRecall.findUnique as jest.Mock).mockResolvedValue({
      id: 'recall-1',
      recalledAt: new Date('2026-10-31T10:00:00.000Z'),
      reason: 'garnish',
      resolvedAt: null,
    });
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { payload: { items: [{ itemId: 'item-1' }, { itemId: 'item-2' }] } },
    ]);

    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([
      { status: 'READY' },
      { status: 'PREPARING' },
    ]);
    await expect(
      clearRecallIfStationReady('order-1', 'restaurant-1', 'station-1')
    ).resolves.toBeNull();
    expect(prisma.stationOrderRecall.updateMany).not.toHaveBeenCalled();

    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([
      { status: 'READY' },
      { status: 'READY' },
    ]);
    (prisma.stationOrderRecall.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });

    await expect(
      clearRecallIfStationReady('order-1', 'restaurant-1', 'station-1')
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'recall-1',
        reason: 'garnish',
        clearedAt: expect.any(Date),
      })
    );
  });
});
