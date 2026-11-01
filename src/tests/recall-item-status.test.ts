import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import {
  hasActiveRecallForItem,
  clearRecallIfStationReady,
  stationItemIds,
} from '@/lib/recall';
import { resolveKitchenActor } from '@/lib/kitchen-actor';
import {
  recordOrderItemStatusChanged,
  recordOrderRecallCleared,
} from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { PATCH as updateItemStatus } from '@/app/api/kitchen/items/[id]/status/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    orderItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    order: { findUnique: jest.fn(), updateMany: jest.fn() },
    stationOrderRecall: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getTokenFromRequest: jest.fn(() => 'staff-token'),
}));

jest.mock('@/lib/kitchen-actor', () => ({
  kitchenActorAudit: jest.fn((actor) => ({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorName: actor.actorName,
    staffId: actor.actorType === 'staff' ? actor.actorId : undefined,
    staffName: actor.actorType === 'staff' ? actor.actorName : undefined,
    deviceId: actor.deviceId,
  })),
  resolveKitchenActor: jest.fn(),
}));

jest.mock('@/lib/recall', () => ({
  hasActiveRecallForItem: jest.fn(),
  clearRecallIfStationReady: jest.fn(),
  stationItemIds: jest.fn(),
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderItemStatusChanged: jest.fn(),
  recordOrderRecallCleared: jest.fn(),
  recordOrderStatusChanged: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderItemStatusChange: jest.fn(),
    publishOrderRecallCleared: jest.fn(),
    publishOrderStatusChange: jest.fn(),
  },
}));

const currentItem = {
  status: 'PREPARING',
  orderId: 'order-1',
  order: {
    restaurantId: 'restaurant-1',
    status: 'READY',
    tableId: 'table-1',
    orderNumber: 'ORD-001',
  },
};

const updatedItem = {
  id: 'item-1',
  status: 'READY',
  order: {
    id: 'order-1',
    restaurantId: 'restaurant-1',
    status: 'READY',
    tableId: 'table-1',
    orderNumber: 'ORD-001',
  },
};

function request() {
  return new NextRequest('http://localhost/api/kitchen/items/item-1/status', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer staff-token',
    },
    body: JSON.stringify({ status: 'READY' }),
  });
}

describe('kitchen item status during recall', () => {
  beforeEach(() => {
    process.env.RECALL_ENABLED = 'true';
    (resolveKitchenActor as jest.Mock).mockResolvedValue({
      restaurantId: 'restaurant-1',
      actorType: 'staff',
      actorId: 'staff-1',
      actorName: 'Kitchen One',
      canRecall: true,
      isManager: false,
      deviceId: 'device-1',
      stationId: 'station-1',
    });
    (prisma.orderItem.findUnique as jest.Mock).mockResolvedValue(currentItem);
    (prisma.orderItem.update as jest.Mock).mockResolvedValue(updatedItem);
    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([
      { status: 'READY' },
    ]);
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      status: 'READY',
      version: 6,
    });
    (prisma.order.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.stationOrderRecall.findMany as jest.Mock).mockResolvedValue([
      { stationId: 'station-1' },
    ]);
    (hasActiveRecallForItem as jest.Mock).mockResolvedValue(true);
    (stationItemIds as jest.Mock).mockResolvedValue(['item-1']);
    (clearRecallIfStationReady as jest.Mock).mockResolvedValue(null);
    (recordOrderItemStatusChanged as jest.Mock).mockResolvedValue(1);
    (recordOrderRecallCleared as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.RECALL_ENABLED;
  });

  it('allows item work on a recalled READY order', async () => {
    const response = await updateItemStatus(request(), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prisma.orderItem.update).toHaveBeenCalled();
  });

  it('still rejects item work on a READY order without recall', async () => {
    (hasActiveRecallForItem as jest.Mock).mockResolvedValue(false);

    const response = await updateItemStatus(request(), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('not in a kitchen-action state');
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('allows a device actor to update an item on its own station', async () => {
    (resolveKitchenActor as jest.Mock).mockResolvedValue({
      restaurantId: 'restaurant-1',
      actorType: 'station',
      actorId: 'device-1',
      actorName: 'Kitchen Station',
      canRecall: true,
      isManager: false,
      deviceId: 'device-1',
      stationId: 'station-1',
    });

    const response = await updateItemStatus(request(), {
      params: Promise.resolve({ id: 'item-1' }),
    });

    expect(response.status).toBe(200);
    expect(recordOrderItemStatusChanged).toHaveBeenCalledWith(
      'order-1',
      'item-1',
      'PREPARING',
      'READY',
      expect.objectContaining({
        actorType: 'station',
        deviceId: 'device-1',
      })
    );
  });

  it('rejects an item outside the station actor scope', async () => {
    (resolveKitchenActor as jest.Mock).mockResolvedValue({
      restaurantId: 'restaurant-1',
      actorType: 'station',
      actorId: 'device-1',
      actorName: 'Kitchen Station',
      canRecall: true,
      isManager: false,
      deviceId: 'device-1',
      stationId: 'station-1',
    });
    (stationItemIds as jest.Mock).mockResolvedValue(['another-item']);

    const response = await updateItemStatus(request(), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('another station');
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('clears the recall when the last item is ready', async () => {
    (clearRecallIfStationReady as jest.Mock).mockResolvedValue({
      id: 'recall-1',
      recalledAt: new Date('2026-10-31T10:00:00.000Z'),
      reason: 'garnish',
      clearedAt: new Date('2026-10-31T10:05:00.000Z'),
    });

    const response = await updateItemStatus(request(), {
      params: Promise.resolve({ id: 'item-1' }),
    });

    expect(response.status).toBe(200);
    expect(recordOrderRecallCleared).toHaveBeenCalledWith(
      'order-1',
      'station-1',
      expect.any(Date),
      expect.any(Date),
      'garnish',
      expect.objectContaining({ actorType: 'staff' })
    );
    expect(PostgresEventManager.publishOrderRecallCleared).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        stationId: 'station-1',
        reason: 'garnish',
      })
    );
  });
});
