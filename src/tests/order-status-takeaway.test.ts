import { NextRequest } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { recordOrderStatusChanged } from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { PATCH as updateOrderStatus } from '@/app/api/orders/[id]/status/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  hasPermission: jest.fn(() => true),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    stationOrderRecall: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderStatusChanged: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderStatusChange: jest.fn(),
    publishRestaurantNotification: jest.fn(),
  },
}));

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

const currentOrder = {
  id: 'order-takeaway-1',
  restaurantId: 'restaurant-1',
  tableId: null,
  orderType: 'TAKEAWAY',
  orderNumber: 'ORD-TAKEAWAY-1',
  status: 'READY',
  paymentStatus: 'PAID',
  version: 1,
  restaurant: { id: 'restaurant-1' },
};

const updatedOrder = {
  ...currentOrder,
  status: 'SERVED',
  version: 2,
  servedAt: new Date(),
  servedBy: 'owner-1',
  table: null,
  customerSession: null,
  items: [],
};

describe('takeaway order status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue({
      userId: 'owner-1',
      userType: 'restaurant_owner',
      isAdmin: false,
      restaurantId: 'restaurant-1',
      roleTemplate: 'restaurant_owner',
      permissions: {},
    });
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(currentOrder);
    (prisma.stationOrderRecall.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (recordOrderStatusChanged as jest.Mock).mockResolvedValue(1);
    (autoUpdateTableStatus as jest.Mock).mockResolvedValue(undefined);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue(updatedOrder),
          },
        })
    );
  });

  it('serves a takeaway order without updating a table', async () => {
    const response = await updateOrderStatus(
      new NextRequest('http://localhost/api/orders/order-takeaway-1/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SERVED' }),
      }),
      { params: Promise.resolve({ id: 'order-takeaway-1' }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.order.status).toBe('SERVED');
    expect(autoUpdateTableStatus).toHaveBeenCalledWith(null);
    expect(PostgresEventManager.publishOrderStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: null })
    );
    expect(recordOrderStatusChanged).toHaveBeenCalledWith(
      'order-takeaway-1',
      'READY',
      'SERVED'
    );
  });

  it('blocks serving a recalled ticket', async () => {
    (prisma.stationOrderRecall.findFirst as jest.Mock).mockResolvedValue({
      id: 'recall-1',
    });

    const response = await updateOrderStatus(
      new NextRequest('http://localhost/api/orders/order-takeaway-1/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SERVED' }),
      }),
      { params: Promise.resolve({ id: 'order-takeaway-1' }) }
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('ORDER_RECALLED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(recordOrderStatusChanged).not.toHaveBeenCalled();
  });

  it('rejects unpaid takeaway pickup', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...currentOrder,
      paymentStatus: 'PENDING',
    });

    const response = await updateOrderStatus(
      new NextRequest('http://localhost/api/orders/order-takeaway-1/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SERVED' }),
      }),
      { params: Promise.resolve({ id: 'order-takeaway-1' }) }
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('PAYMENT_REQUIRED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(recordOrderStatusChanged).not.toHaveBeenCalled();
    expect(autoUpdateTableStatus).not.toHaveBeenCalled();
  });
});
