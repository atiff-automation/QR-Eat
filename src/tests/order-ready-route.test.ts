import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { resolveKitchenActor } from '@/lib/kitchen-actor';
import {
  clearRecallIfStationReady,
  resolveOrderStationIds,
  stationItemIds,
} from '@/lib/recall';
import { findReceipt, saveReceipt } from '@/lib/order-idempotency';
import {
  recordOrderItemStatusChanged,
  recordOrderRecallCleared,
  recordOrderStatusChanged,
} from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { POST as markOrderReady } from '@/app/api/orders/[id]/ready/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    orderItem: { findMany: jest.fn() },
    stationOrderRecall: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/kitchen-actor', () => ({
  resolveKitchenActor: jest.fn(),
}));

jest.mock('@/lib/recall', () => ({
  resolveOrderStationIds: jest.fn(),
  stationItemIds: jest.fn(),
  clearRecallIfStationReady: jest.fn(),
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderItemStatusChanged: jest.fn(),
  recordOrderStatusChanged: jest.fn(),
  recordOrderRecallCleared: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderItemStatusChange: jest.fn(),
    publishOrderStatusChange: jest.fn(),
    publishOrderRecallCleared: jest.fn(),
  },
}));

jest.mock('@/lib/order-idempotency', () => ({
  findReceipt: jest.fn(),
  saveReceipt: jest.fn(),
  idempotencyKeyFrom: jest.fn(() => 'ready-key-1'),
  ORDER_ACTION: { ORDER_READY: 'order.ready', ITEM_STATUS: 'item.status' },
}));

const order = {
  id: 'order-1',
  restaurantId: 'restaurant-1',
  orderNumber: 'ORD-1',
  status: 'PREPARING',
  version: 2,
  readyAt: null,
  tableId: 'table-1',
};

function request() {
  return new NextRequest('http://localhost/api/orders/order-1/ready', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'ready-key-1',
      authorization: 'Bearer staff-token',
    },
    body: JSON.stringify({ expectedVersion: 2 }),
  });
}

describe('POST /api/orders/[id]/ready', () => {
  let tx: {
    order: {
      updateMany: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    orderItem: { updateMany: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'READY',
          version: 3,
          readyAt: new Date(),
        }),
      },
      orderItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'item-1', status: 'READY' }]),
      },
    };

    (resolveKitchenActor as jest.Mock).mockResolvedValue({
      restaurantId: 'restaurant-1',
      actorId: 'staff-1',
      actorName: 'Kitchen One',
      canRecall: true,
      isManager: false,
      deviceStationId: 'station-1',
    });
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(order);
    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([
      { id: 'item-1', status: 'PREPARING' },
    ]);
    (prisma.stationOrderRecall.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
    (resolveOrderStationIds as jest.Mock).mockResolvedValue(['station-1']);
    (stationItemIds as jest.Mock).mockResolvedValue(['item-1']);
    (clearRecallIfStationReady as jest.Mock).mockResolvedValue(null);
    (findReceipt as jest.Mock).mockResolvedValue(null);
    (saveReceipt as jest.Mock).mockResolvedValue({});
    (recordOrderItemStatusChanged as jest.Mock).mockResolvedValue(1);
    (recordOrderStatusChanged as jest.Mock).mockResolvedValue(1);
    (recordOrderRecallCleared as jest.Mock).mockResolvedValue(undefined);
    (
      PostgresEventManager.publishOrderItemStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
    (
      PostgresEventManager.publishOrderStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
    (
      PostgresEventManager.publishOrderRecallCleared as jest.Mock
    ).mockResolvedValue(undefined);
  });

  it('marks the station ticket ready atomically', async () => {
    const response = await markOrderReady(request(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.order.status).toBe('READY');
    expect(tx.orderItem.updateMany).toHaveBeenCalled();
    expect(recordOrderItemStatusChanged).toHaveBeenCalledWith(
      'order-1',
      'item-1',
      'PREPARING',
      'READY',
      expect.objectContaining({ staffId: 'staff-1' })
    );
    expect(recordOrderStatusChanged).toHaveBeenCalledWith(
      'order-1',
      'PREPARING',
      'READY'
    );
    expect(saveReceipt).toHaveBeenCalled();
  });

  it('replays a stored idempotent response', async () => {
    (findReceipt as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: { success: true, order: { id: 'order-1', status: 'READY' } },
    });

    const response = await markOrderReady(request(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.order.status).toBe('READY');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns a version conflict', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    const response = await markOrderReady(request(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('VERSION_CONFLICT');
    expect(saveReceipt).not.toHaveBeenCalled();
  });

  it('clears an active recall after the rebump', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...order,
      status: 'READY',
    });
    (prisma.stationOrderRecall.findUnique as jest.Mock).mockResolvedValue({
      id: 'recall-1',
      resolvedAt: null,
    });
    (clearRecallIfStationReady as jest.Mock).mockResolvedValue({
      id: 'recall-1',
      recalledAt: new Date('2026-10-31T10:00:00.000Z'),
      reason: 'garnish',
      clearedAt: new Date('2026-10-31T10:05:00.000Z'),
    });

    const response = await markOrderReady(request(), {
      params: Promise.resolve({ id: 'order-1' }),
    });

    expect(response.status).toBe(200);
    expect(recordOrderRecallCleared).toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderRecallCleared).toHaveBeenCalled();
  });
});
