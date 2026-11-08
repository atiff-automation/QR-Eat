import { prisma } from '@/lib/database';
import {
  CounterOrderError,
  createCounterOrder,
} from '@/lib/services/counter-order-service';
import { syncOfflineOrder } from '@/lib/services/offline-order-sync-service';
import { confirmPendingOrder } from '@/lib/services/order-dispatch-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn(), update: jest.fn() },
    orderItem: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/services/counter-order-service', () => {
  const actual = jest.requireActual('@/lib/services/counter-order-service');
  return { ...actual, createCounterOrder: jest.fn() };
});

jest.mock('@/lib/services/order-dispatch-service', () => {
  const actual = jest.requireActual('@/lib/services/order-dispatch-service');
  return { ...actual, confirmPendingOrder: jest.fn() };
});

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const clientOrderId = 'client-order-1';
const actor = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  isAdmin: false,
  restaurantId,
};

const input = {
  clientOrderId,
  counterReference: 'OFF-261108-022',
  deviceId: 'counter-device-1',
  orderType: 'DINE_IN' as const,
  tableId,
  customerName: null,
  customerPhone: null,
  specialInstructions: null,
  createdAtDevice: '2026-11-02T12:00:00.000Z',
  items: [
    {
      clientItemId: 'client-item-1',
      menuItemId: '550e8400-e29b-41d4-a716-446655440003',
      quantity: 1,
      optionIds: [],
      notes: null,
    },
  ],
  priceSnapshot: {
    currency: 'MYR',
    subtotal: '19.00',
    tax: '1.14',
    service: '1.90',
    total: '22.04',
    taxRate: '0.06',
    serviceRate: '0.10',
  },
  kitchen: { printedAtDevice: '2026-11-02T12:01:00.000Z' },
};

const createdOrder = {
  id: 'server-order-1',
  orderNumber: 'ORD-261102-E031-001',
  counterReference: 'OFF-261108-022',
  dailySeq: 1,
  status: 'CONFIRMED',
  paymentStatus: 'PENDING',
  source: 'COUNTER',
  orderType: 'DINE_IN',
  totalAmount: '22.04',
  tableId,
  tableNumber: '2',
  tableName: 'Window',
  createdAt: '2026-11-02T12:02:00.000Z',
};

describe('offline order sync service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([
      { id: 'server-item-1', clientItemId: 'client-item-1' },
    ]);
    (prisma.order.update as jest.Mock).mockResolvedValue({});
    (createCounterOrder as jest.Mock).mockResolvedValue({
      order: createdOrder,
      ticket: null,
      warning: null,
      replayed: false,
    });
  });

  it('creates a server order and maps client item ids', async () => {
    const result = await syncOfflineOrder(input, actor, 'idem-1');

    expect(createCounterOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        clientOrderId,
        orderType: 'DINE_IN',
        tableId,
        sendToKitchen: true,
        items: [
          expect.objectContaining({
            clientItemId: 'client-item-1',
            menuItemId: '550e8400-e29b-41d4-a716-446655440003',
          }),
        ],
      }),
      actor,
      'idem-1',
      expect.objectContaining({
        offlineDelivered: true,
        offlineDeviceId: 'counter-device-1',
        counterReference: 'OFF-261108-022',
      })
    );
    expect(result).toMatchObject({
      clientOrderId,
      replayed: false,
      order: {
        id: 'server-order-1',
        orderNumber: 'ORD-261102-E031-001',
        counterReference: 'OFF-261108-022',
      },
      itemIds: { 'client-item-1': 'server-item-1' },
      priceVariance: null,
    });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('records a price variance without rejecting the order', async () => {
    (createCounterOrder as jest.Mock).mockResolvedValue({
      order: { ...createdOrder, totalAmount: '23.00' },
      ticket: null,
      warning: null,
      replayed: false,
    });

    const result = await syncOfflineOrder(input, actor, 'idem-1');

    expect(result.priceVariance).toEqual({
      localTotal: '22.04',
      serverTotal: '23.00',
      difference: '0.96',
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'server-order-1' },
      data: {
        priceVariance: {
          localTotal: '22.04',
          serverTotal: '23.00',
          difference: '0.96',
        },
      },
    });
  });

  it('returns the existing mapping on replay', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'server-order-1',
      orderNumber: 'ORD-261102-E031-001',
      counterReference: 'OFF-261108-022',
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      orderType: 'DINE_IN',
      totalAmount: { toString: () => '22.04' },
      tableId,
      createdAt: new Date('2026-11-02T12:02:00.000Z'),
      restaurantId,
      table: { tableNumber: '2', tableName: 'Window' },
      items: [{ id: 'server-item-1', clientItemId: 'client-item-1' }],
      priceVariance: null,
    });

    const result = await syncOfflineOrder(input, actor, 'idem-1');

    expect(result.replayed).toBe(true);
    expect(result.itemIds).toEqual({ 'client-item-1': 'server-item-1' });
    expect(createCounterOrder).not.toHaveBeenCalled();
    expect(confirmPendingOrder).not.toHaveBeenCalled();
  });

  it('confirms an existing PENDING order on replay', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'server-order-1',
      orderNumber: 'ORD-261102-E031-001',
      counterReference: 'OFF-261108-022',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      orderType: 'DINE_IN',
      totalAmount: { toString: () => '22.04' },
      tableId,
      createdAt: new Date('2026-11-02T12:02:00.000Z'),
      restaurantId,
      table: { tableNumber: '2', tableName: 'Window' },
      items: [{ id: 'server-item-1', clientItemId: 'client-item-1' }],
      priceVariance: null,
    });
    (confirmPendingOrder as jest.Mock).mockResolvedValue({
      order: {
        ...createdOrder,
        status: 'CONFIRMED',
        tableId,
        table: { tableNumber: '2', tableName: 'Window' },
        createdAt: new Date('2026-11-02T12:02:00.000Z'),
      },
      ticket: null,
      replayed: false,
    });

    const result = await syncOfflineOrder(input, actor, 'idem-1');

    expect(confirmPendingOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'server-order-1',
        actor,
        offlineDelivered: true,
        paperChitPrinted: false,
      })
    );
    expect(result.replayed).toBe(true);
    expect(result.order.status).toBe('CONFIRMED');
    expect(result.itemIds).toEqual({ 'client-item-1': 'server-item-1' });
    expect(createCounterOrder).not.toHaveBeenCalled();
  });

  it('backfills a stable counter reference on an older replay', async () => {
    const existing = {
      id: 'server-order-1',
      orderNumber: 'ORD-261102-E031-001',
      counterReference: null,
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      orderType: 'DINE_IN',
      totalAmount: { toString: () => '22.04' },
      tableId,
      createdAt: new Date('2026-11-02T12:02:00.000Z'),
      restaurantId,
      table: { tableNumber: '2', tableName: 'Window' },
      items: [{ id: 'server-item-1', clientItemId: 'client-item-1' }],
      priceVariance: null,
    };
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(existing);
    (prisma.order.update as jest.Mock).mockResolvedValue({
      ...existing,
      counterReference: 'OFF-261108-022',
    });

    const result = await syncOfflineOrder(input, actor, 'idem-1');

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'server-order-1' },
        data: { counterReference: 'OFF-261108-022' },
      })
    );
    expect(result.order.counterReference).toBe('OFF-261108-022');
    expect(createCounterOrder).not.toHaveBeenCalled();
  });

  it('rejects a client order from another restaurant', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      restaurantId: 'another-restaurant',
      items: [],
      table: null,
      priceVariance: null,
    });

    await expect(
      syncOfflineOrder(input, actor, 'idem-1')
    ).rejects.toBeInstanceOf(CounterOrderError);
  });
});
