import { prisma } from '@/lib/database';
import { resolveRouting } from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import {
  confirmPendingOrder,
  OrderDispatchError,
} from '@/lib/services/order-dispatch-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    device: { findFirst: jest.fn() },
    orderEvent: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    table: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/order-events', () => {
  const actual = jest.requireActual('@/lib/order-events');
  return {
    ...actual,
    resolveRouting: jest.fn(),
    recordOrderCreated: jest.fn(),
    recordOrderStatusChanged: jest.fn(),
  };
});

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderStatusChange: jest.fn(),
    publishKitchenNotification: jest.fn(),
  },
}));

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

const pendingOrder = {
  id: 'order-1',
  restaurantId: 'restaurant-1',
  tableId: 'table-1',
  orderNumber: 'ORD-1',
  status: 'PENDING',
  source: 'COUNTER',
  version: 1,
  createdAt: new Date(),
  table: { tableNumber: '2', tableName: 'Center' },
  customerSession: null,
  items: [
    { menuItem: { categoryId: 'cat-1' } },
    { menuItem: { categoryId: 'cat-2' } },
  ],
};

const confirmedOrder = {
  ...pendingOrder,
  status: 'CONFIRMED',
  version: 2,
};

const actor = { userId: 'staff-1', userType: 'staff' };

function routingWith(
  modes: Record<string, string>,
  byCategory: Map<string, string> = new Map()
) {
  const ids = Object.keys(modes);
  return {
    byCategory,
    defaultStationId: ids[0] ?? null,
    stationIds: new Set(ids),
    printModes: new Map(Object.entries(modes)),
  };
}

function mockConfirmTransaction() {
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (tx: unknown) => unknown) =>
      callback({
        order: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue(confirmedOrder),
        },
      })
  );
}

describe('confirmPendingOrder print authority guard (§9.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(pendingOrder);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
    (autoUpdateTableStatus as jest.Mock).mockResolvedValue(undefined);
    mockConfirmTransaction();
  });

  it('confirms an all-COUNTER order with no online device', async () => {
    (resolveRouting as jest.Mock).mockResolvedValue(
      routingWith({ 'station-1': 'COUNTER' })
    );

    const result = await confirmPendingOrder({ orderId: 'order-1', actor });

    expect(result.replayed).toBe(false);
    expect(prisma.device.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: 'restaurant-1',
          category: 'orders',
          newValues: expect.objectContaining({
            printAuthority: 'COUNTER',
            routedStationIds: ['station-1'],
            noKitchenDevice: true,
          }),
        }),
      })
    );
  });

  it('confirms an all-NONE order with no online device', async () => {
    (resolveRouting as jest.Mock).mockResolvedValue(
      routingWith({ 'station-1': 'NONE' })
    );

    await confirmPendingOrder({ orderId: 'order-1', actor });

    expect(prisma.device.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          newValues: expect.objectContaining({
            printAuthority: 'NONE',
            noKitchenDevice: true,
          }),
        }),
      })
    );
  });

  it('still blocks a mixed order with a STATION ticket when the Kitchen is offline', async () => {
    (resolveRouting as jest.Mock).mockResolvedValue(
      routingWith(
        { 'station-1': 'STATION', 'station-2': 'COUNTER' },
        new Map([['cat-2', 'station-2']])
      )
    );

    await expect(
      confirmPendingOrder({ orderId: 'order-1', actor })
    ).rejects.toMatchObject<Partial<OrderDispatchError>>({
      code: 'STATION_OFFLINE',
      statusCode: 409,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Only a device on the routed STATION station satisfies the guard.
    expect(prisma.device.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stationId: { in: ['station-1'] },
        }),
      })
    );
  });

  it('confirms a mixed order when the routed STATION device is online', async () => {
    (resolveRouting as jest.Mock).mockResolvedValue(
      routingWith(
        { 'station-1': 'STATION', 'station-2': 'COUNTER' },
        new Map([['cat-2', 'station-2']])
      )
    );
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'device-1',
    });

    await confirmPendingOrder({ orderId: 'order-1', actor });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          newValues: expect.objectContaining({
            printAuthority: 'STATION',
            routedStationIds: ['station-1', 'station-2'],
            noKitchenDevice: false,
          }),
        }),
      })
    );
  });

  it('keeps the any-online-device guard for an unrouted order', async () => {
    (resolveRouting as jest.Mock).mockResolvedValue({
      byCategory: new Map(),
      defaultStationId: null,
      stationIds: new Set(),
      printModes: new Map(),
    });

    await expect(
      confirmPendingOrder({ orderId: 'order-1', actor })
    ).rejects.toMatchObject({ code: 'STATION_OFFLINE' });

    expect(prisma.device.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ stationId: expect.anything() }),
      })
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('confirms an unrouted order with an online device', async () => {
    (resolveRouting as jest.Mock).mockResolvedValue({
      byCategory: new Map(),
      defaultStationId: null,
      stationIds: new Set(),
      printModes: new Map(),
    });
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'device-1',
    });

    await confirmPendingOrder({ orderId: 'order-1', actor });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          newValues: expect.objectContaining({
            printAuthority: null,
            routedStationIds: [],
            noKitchenDevice: false,
          }),
        }),
      })
    );
  });

  it('keeps the manager override for an offline mixed order', async () => {
    (resolveRouting as jest.Mock).mockResolvedValue(
      routingWith({ 'station-1': 'STATION' })
    );

    await confirmPendingOrder({
      orderId: 'order-1',
      actor,
      overrideStation: true,
    });

    expect(prisma.device.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          newValues: expect.objectContaining({ stationOverride: true }),
        }),
      })
    );
  });

  it('keeps the offlineDelivered bypass', async () => {
    (resolveRouting as jest.Mock).mockResolvedValue(
      routingWith({ 'station-1': 'STATION' })
    );

    await confirmPendingOrder({
      orderId: 'order-1',
      actor,
      offlineDelivered: true,
    });

    expect(prisma.device.findFirst).not.toHaveBeenCalled();
    expect(PostgresEventManager.publishKitchenNotification).toHaveBeenCalled();
  });
});
