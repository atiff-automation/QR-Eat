import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { getTenantContext, hasPermission } from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { recordOrderStatusChanged } from '@/lib/order-events';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { ORDER_PERMISSIONS } from '@/lib/rbac/permission-constants';
import { PATCH as updateOrderStatus } from '@/app/api/orders/[id]/status/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  hasPermission: jest.fn(() => false),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    orderEvent: { findMany: jest.fn() },
    station: { findMany: jest.fn() },
    stationOrderRecall: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/order-events', () => {
  const actual = jest.requireActual('@/lib/order-events');
  return { ...actual, recordOrderStatusChanged: jest.fn() };
});

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderStatusChange: jest.fn(),
    publishRestaurantNotification: jest.fn(),
  },
}));

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

jest.mock('@/lib/services/order-dispatch-service', () => {
  const actual = jest.requireActual('@/lib/services/order-dispatch-service');
  return {
    ...actual,
    confirmPendingOrder: jest.fn(),
  };
});

const counterOrder = {
  id: 'order-1',
  restaurantId: 'restaurant-1',
  tableId: 'table-1',
  orderType: 'DINE_IN',
  orderNumber: 'ORD-1',
  status: 'CONFIRMED',
  source: 'COUNTER',
  paymentStatus: 'PENDING',
  version: 1,
  restaurant: { id: 'restaurant-1' },
};

function context(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'cashier-1',
    userType: 'staff',
    roleTemplate: 'cashier',
    restaurantId: 'restaurant-1',
    email: 'cashier@example.test',
    permissions: { orders: ['read', 'write'] },
    isAdmin: false,
    mustChangePassword: false,
    ...overrides,
  };
}

function patchRequest(status: string) {
  return new NextRequest('http://localhost/api/orders/order-1/status', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

const params = { params: Promise.resolve({ id: 'order-1' }) };

describe('cashier order status authority (§9.1, C-8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasPermission as jest.Mock).mockReturnValue(false);
    (getTenantContext as jest.Mock).mockResolvedValue(context());
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(counterOrder);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { stationId: 'station-1', payload: { printMode: 'COUNTER' } },
    ]);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 'station-1', settings: { printMode: 'COUNTER' } },
    ]);
    (prisma.stationOrderRecall.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (recordOrderStatusChanged as jest.Mock).mockResolvedValue(1);
    (autoUpdateTableStatus as jest.Mock).mockResolvedValue(undefined);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest
              .fn()
              .mockResolvedValue({ ...counterOrder, status: 'PREPARING' }),
          },
        })
    );
  });

  it('allows a cashier PREPARING when all routed stations are COUNTER/NONE', async () => {
    const response = await updateOrderStatus(patchRequest('PREPARING'), params);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tableName: 'orders',
          recordId: 'order-1',
          restaurantId: 'restaurant-1',
          changedBy: 'cashier-1',
          changedByType: 'staff',
          category: 'orders',
          description: 'order.status',
          newValues: expect.objectContaining({
            status: 'PREPARING',
            authority: 'COUNTER_NO_KITCHEN',
            roleTemplate: 'cashier',
          }),
        }),
      })
    );
  });

  it('allows READY and SERVED through the same no-Kitchen path', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...counterOrder,
      status: 'PREPARING',
      paymentStatus: 'PAID',
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest
              .fn()
              .mockResolvedValue({ ...counterOrder, status: 'READY' }),
          },
        })
    );
    const ready = await updateOrderStatus(patchRequest('READY'), params);
    expect(ready.status).toBe(200);

    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...counterOrder,
      status: 'READY',
      paymentStatus: 'PAID',
    });
    const served = await updateOrderStatus(patchRequest('SERVED'), params);
    expect(served.status).toBe(200);
  });

  it('denies a cashier when any routed station is STATION', async () => {
    // The real resolver reads the stamped event mode.
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { stationId: 'station-1', payload: { printMode: 'STATION' } },
    ]);

    const response = await updateOrderStatus(patchRequest('PREPARING'), params);

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('denies a cashier on a non-Counter order source', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...counterOrder,
      source: 'QR',
    });

    const response = await updateOrderStatus(patchRequest('PREPARING'), params);

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not grant CONFIRMED to a cashier', async () => {
    const confirmed = await updateOrderStatus(
      patchRequest('CONFIRMED'),
      params
    );
    expect(confirmed.status).toBe(403);
  });

  it('rejects the legacy CANCELLED status path with USE_CANCEL_ENDPOINT', async () => {
    const cancelled = await updateOrderStatus(
      patchRequest('CANCELLED'),
      params
    );
    const json = await cancelled.json();

    expect(cancelled.status).toBe(409);
    expect(json.code).toBe('USE_CANCEL_ENDPOINT');
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('still rejects PENDING → PREPARING for an otherwise authorised cashier', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...counterOrder,
      status: 'PENDING',
    });

    const response = await updateOrderStatus(patchRequest('PREPARING'), params);

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the takeaway PAID guard for a cashier SERVED', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...counterOrder,
      orderType: 'TAKEAWAY',
      tableId: null,
      status: 'READY',
      paymentStatus: 'PENDING',
    });

    const response = await updateOrderStatus(patchRequest('SERVED'), params);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('PAYMENT_REQUIRED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the ORDER_RECALLED guard for a cashier', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      ...counterOrder,
      status: 'READY',
      paymentStatus: 'PAID',
    });
    (prisma.stationOrderRecall.findFirst as jest.Mock).mockResolvedValue({
      id: 'recall-1',
    });

    const response = await updateOrderStatus(patchRequest('SERVED'), params);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('ORDER_RECALLED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the durable orders:counter_serve permission for a custom role', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(
      context({
        roleTemplate: 'lead',
        permissions: { orders: ['counter_serve'] },
      })
    );
    (hasPermission as jest.Mock).mockImplementation(
      (_context: unknown, resource: string, action: string) =>
        resource === 'orders' && action === 'counter_serve'
    );

    const response = await updateOrderStatus(patchRequest('PREPARING'), params);

    expect(response.status).toBe(200);
    expect(prisma.orderEvent.findMany).toHaveBeenCalled();
  });

  it('keeps the existing manager path without the cashier check', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(
      context({ userId: 'manager-1', roleTemplate: 'manager' })
    );
    (hasPermission as jest.Mock).mockReturnValue(false);

    const response = await updateOrderStatus(patchRequest('PREPARING'), params);

    expect(response.status).toBe(200);
    expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
  });

  it('keeps the platform-admin behaviour', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(
      context({
        userId: 'admin-1',
        userType: 'platform_admin',
        roleTemplate: undefined,
        isAdmin: true,
        restaurantId: undefined,
      })
    );

    const response = await updateOrderStatus(patchRequest('PREPARING'), params);

    expect(response.status).toBe(200);
    expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
  });
});

describe('orders:counter_serve permission mapping', () => {
  it('is defined in the permission constants', () => {
    expect(ORDER_PERMISSIONS.COUNTER_SERVE).toBe('orders:counter_serve');
  });

  it('is granted to the cashier role template in the seed', () => {
    const seed = fs.readFileSync(
      path.join(process.cwd(), 'prisma/seed.ts'),
      'utf8'
    );
    const cashierStart = seed.indexOf("template: 'cashier'");
    expect(cashierStart).toBeGreaterThan(-1);
    const cashierBlock = seed.slice(
      cashierStart,
      seed.indexOf(']', cashierStart)
    );
    expect(cashierBlock).toContain("'orders:counter_serve'");
  });
});
