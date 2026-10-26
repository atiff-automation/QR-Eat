import { prisma } from '@/lib/database';
import {
  recordOrderCreated,
  recordOrderStatusChanged,
} from '@/lib/order-events';
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
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderCreated: jest.fn(),
  recordOrderStatusChanged: jest.fn(),
}));

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
  version: 1,
  createdAt: new Date(),
  table: { tableNumber: '2', tableName: 'Center' },
  customerSession: null,
  items: [],
};

const confirmedOrder = {
  ...pendingOrder,
  status: 'CONFIRMED',
  version: 2,
};

const actor = { userId: 'staff-1', userType: 'staff' };

describe('confirmPendingOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(pendingOrder);
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'device-1',
    });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (recordOrderCreated as jest.Mock).mockResolvedValue({
      tickets: 1,
      stationIds: ['station-1'],
      unroutedItemIds: [],
      replayed: false,
    });
    (recordOrderStatusChanged as jest.Mock).mockResolvedValue(1);
    (autoUpdateTableStatus as jest.Mock).mockResolvedValue(undefined);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue(confirmedOrder),
          },
        })
    );
  });

  it('does not confirm while the kitchen station is offline', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      confirmPendingOrder({ orderId: 'order-1', actor })
    ).rejects.toMatchObject<Partial<OrderDispatchError>>({
      code: 'STATION_OFFLINE',
      statusCode: 409,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(recordOrderCreated).not.toHaveBeenCalled();
  });

  it('confirms and dispatches through the shared kitchen path', async () => {
    const result = await confirmPendingOrder({ orderId: 'order-1', actor });

    expect(result.replayed).toBe(false);
    expect(result.ticket).toMatchObject({
      routed: true,
      stationIds: ['station-1'],
      ticketStatus: 'QUEUED',
    });
    expect(recordOrderCreated).toHaveBeenCalledWith('order-1');
    expect(recordOrderStatusChanged).toHaveBeenCalledWith(
      'order-1',
      'PENDING',
      'CONFIRMED'
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderStatusChange).toHaveBeenCalled();
    expect(PostgresEventManager.publishKitchenNotification).toHaveBeenCalled();
    expect(autoUpdateTableStatus).toHaveBeenCalledWith('table-1');
  });

  it('allows a manager override while the station is offline', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await confirmPendingOrder({
      orderId: 'order-1',
      actor,
      overrideStation: true,
    });

    expect(result.replayed).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
