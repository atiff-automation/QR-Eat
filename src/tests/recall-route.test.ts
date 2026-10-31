import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { getTenantContext } from '@/lib/tenant-context';
import { resolveOrderStationIds, stationItemIds } from '@/lib/recall';
import { recordOrderRecalled } from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { POST as recallOrder } from '@/app/api/orders/[id]/recall/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    stationOrderRecall: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
}));

jest.mock('@/lib/auth-utils', () => ({
  getTokenFromRequest: jest.fn(() => 'staff-token'),
}));

jest.mock('@/lib/device-auth', () => ({
  verifyStaffSession: jest.fn(),
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderRecalled: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: { publishOrderRecalled: jest.fn() },
}));

jest.mock('@/lib/recall', () => {
  const actual = jest.requireActual('@/lib/recall');
  return {
    ...actual,
    resolveOrderStationIds: jest.fn(),
    stationItemIds: jest.fn(),
  };
});

const baseOrder = {
  id: 'order-1',
  restaurantId: 'restaurant-1',
  orderNumber: 'ORD-001',
  status: 'READY',
  readyAt: new Date(),
  version: 5,
};

function makeRequest(body: Record<string, unknown> = {}, headers = {}) {
  return new NextRequest('http://localhost/api/orders/order-1/recall', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'idem-1',
      ...headers,
    },
    body: JSON.stringify({ expectedVersion: 5, ...body }),
  });
}

describe('POST /api/orders/[id]/recall', () => {
  let tx: {
    order: { updateMany: jest.Mock; findUnique: jest.Mock };
    orderItem: { updateMany: jest.Mock };
    stationOrderRecall: { upsert: jest.Mock };
  };

  beforeEach(() => {
    process.env.RECALL_ENABLED = 'true';
    tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'order-1', status: 'READY', version: 6 }),
      },
      orderItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stationOrderRecall: {
        upsert: jest.fn().mockResolvedValue({
          id: 'recall-1',
          orderId: 'order-1',
          stationId: 'station-1',
          recalledAt: new Date(),
          reason: null,
          resolvedAt: null,
        }),
      },
    };

    (getTenantContext as jest.Mock).mockResolvedValue({
      userId: 'owner-1',
      userType: 'restaurant_owner',
      isAdmin: false,
      restaurantId: 'restaurant-1',
      roleTemplate: 'restaurant_owner',
      permissions: {},
    });
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(baseOrder);
    (prisma.stationOrderRecall.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
    (resolveOrderStationIds as jest.Mock).mockResolvedValue(['station-1']);
    (stationItemIds as jest.Mock).mockResolvedValue(['item-1']);
    (recordOrderRecalled as jest.Mock).mockResolvedValue(undefined);
    (PostgresEventManager.publishOrderRecalled as jest.Mock).mockResolvedValue(
      undefined
    );
  });

  afterEach(() => {
    delete process.env.RECALL_ENABLED;
  });

  it('recalls a READY order without changing its status', async () => {
    const response = await recallOrder(makeRequest(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.order.status).toBe('READY');
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', id: { in: ['item-1'] } },
      data: { status: 'PREPARING', updatedAt: expect.any(Date) },
    });
    expect(recordOrderRecalled).toHaveBeenCalledWith(
      'order-1',
      'station-1',
      expect.any(Date),
      null
    );
    expect(PostgresEventManager.publishOrderRecalled).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        stationId: 'station-1',
        restaurantId: 'restaurant-1',
      })
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'READY', version: 5 }),
      })
    );
  });

  it('is hidden when the feature flag is off', async () => {
    process.env.RECALL_ENABLED = 'false';

    const response = await recallOrder(makeRequest(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('RECALL_DISABLED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a served order', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...baseOrder,
      status: 'SERVED',
    });

    const response = await recallOrder(makeRequest(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('ORDER_NOT_RECALLABLE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a recall after the 15-minute window', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...baseOrder,
      readyAt: new Date(Date.now() - 16 * 60_000),
    });

    const response = await recallOrder(makeRequest(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('RECALL_WINDOW_EXPIRED');
  });

  it('returns a version conflict when the order changed', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    const response = await recallOrder(makeRequest(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('VERSION_CONFLICT');
  });

  it('replays an active recall with the same idempotency key', async () => {
    (prisma.stationOrderRecall.findUnique as jest.Mock).mockResolvedValue({
      id: 'recall-1',
      orderId: 'order-1',
      stationId: 'station-1',
      idempotencyKey: 'idem-1',
      resolvedAt: null,
    });

    const response = await recallOrder(makeRequest(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.replayed).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a second recall without the same idempotency key', async () => {
    (prisma.stationOrderRecall.findUnique as jest.Mock).mockResolvedValue({
      id: 'recall-1',
      orderId: 'order-1',
      stationId: 'station-1',
      idempotencyKey: 'other',
      resolvedAt: null,
    });

    const response = await recallOrder(makeRequest(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('RECALL_ALREADY_ACTIVE');
  });

  it('requires a station for a multi-station order', async () => {
    (resolveOrderStationIds as jest.Mock).mockResolvedValue([
      'station-1',
      'station-2',
    ]);

    const response = await recallOrder(makeRequest(), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('STATION_REQUIRED');
  });
});
