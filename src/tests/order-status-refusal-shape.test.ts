import { NextRequest } from 'next/server';
import {
  getTenantContext,
  hasPermission as contextHasPermission,
} from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { recordOrderStatusChanged } from '@/lib/order-events';
import { PATCH as updateOrderStatusRoute } from '@/app/api/orders/[id]/status/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  hasPermission: jest.fn(() => false),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    stationOrderRecall: { findFirst: jest.fn() },
    order: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    orderEvent: {
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    restaurantChange: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderStatusChange: jest.fn(),
    publishRestaurantNotification: jest.fn(),
  },
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderStatusChanged: jest.fn(),
}));

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

jest.mock('@/lib/restaurant-changes', () => ({
  recordRestaurantChange: jest.fn(),
}));

jest.mock('@/lib/services/order-dispatch-service', () => ({
  confirmPendingOrder: jest.fn(),
  OrderDispatchError: class OrderDispatchError extends Error {},
  resolveOrderPrintAuthority: jest.fn(),
}));

jest.mock('@/lib/client-ip', () => ({
  trustedIp: jest.fn(() => '127.0.0.1'),
}));

const orderId = '550e8400-e29b-41d4-a716-446655440010';

const NOT_FOUND = {
  success: false,
  error: 'Order not found',
  code: 'ORDER_NOT_FOUND',
};

const managerContext = {
  userId: 'manager-1',
  userType: 'staff',
  roleTemplate: 'manager',
  restaurantId: 'restaurant-1',
  email: 'manager@example.test',
  permissions: { orders: ['read', 'write', 'update', 'kitchen'] },
  isAdmin: false,
  mustChangePassword: false,
};

const currentOrder = {
  id: orderId,
  restaurantId: 'restaurant-1',
  status: 'CONFIRMED',
  version: 1,
  source: 'QR',
  orderType: 'DINE_IN',
  paymentStatus: 'PENDING',
  tableId: null,
  orderNumber: 'AME020-A',
};

function request(body: unknown = { status: 'PREPARING' }) {
  return new NextRequest(`http://localhost/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: orderId }) };
}

function mockContext(context: unknown = managerContext) {
  (getTenantContext as jest.Mock).mockResolvedValue(context);
}

function mockOrder(order: unknown = currentOrder) {
  (prisma.order.findUnique as jest.Mock).mockResolvedValue(order);
}

function mockSuccessfulUpdate() {
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (tx: unknown) => unknown) =>
      callback({
        order: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...currentOrder,
            status: 'PREPARING',
            version: 2,
          }),
        },
      })
  );
}

describe('PATCH /api/orders/{id}/status refusal shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContext();
    mockOrder();
    mockSuccessfulUpdate();
    (recordOrderStatusChanged as jest.Mock).mockResolvedValue(1);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.stationOrderRecall.findFirst as jest.Mock).mockResolvedValue(null);
    (contextHasPermission as jest.Mock).mockReturnValue(false);
  });

  it('keeps an own-tenant permitted transition working', async () => {
    const response = await updateOrderStatusRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.order.status).toBe('PREPARING');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('maps a cross-tenant order to 404 ORDER_NOT_FOUND without a write', async () => {
    mockOrder({ ...currentOrder, restaurantId: 'restaurant-2' });

    const response = await updateOrderStatusRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(recordOrderStatusChanged).not.toHaveBeenCalled();
  });

  it('maps a missing order to the identical 404 body', async () => {
    mockOrder(null);
    const missing = await updateOrderStatusRoute(request(), params());

    mockOrder({ ...currentOrder, restaurantId: 'restaurant-2' });
    const cross = await updateOrderStatusRoute(request(), params());

    expect(missing.status).toBe(404);
    expect(cross.status).toBe(404);
    const missingBody = await missing.json();
    expect(missingBody).toEqual(await cross.json());
    expect(missingBody).toEqual(NOT_FOUND);
  });

  it('does not let a cross-tenant SERVED probe read recall state', async () => {
    mockOrder({ ...currentOrder, restaurantId: 'restaurant-2' });
    (prisma.stationOrderRecall.findFirst as jest.Mock).mockResolvedValue({
      id: 'recall-1',
    });

    const response = await updateOrderStatusRoute(
      request({ status: 'SERVED' }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
    expect(prisma.stationOrderRecall.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the own-tenant recall refusal at 409 ORDER_RECALLED', async () => {
    (prisma.stationOrderRecall.findFirst as jest.Mock).mockResolvedValue({
      id: 'recall-1',
    });

    const response = await updateOrderStatusRoute(
      request({ status: 'SERVED' }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('ORDER_RECALLED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when the owner has no matching current restaurant', async () => {
    mockContext({
      ...managerContext,
      userType: 'restaurant_owner',
      roleTemplate: 'owner',
      restaurantId: 'restaurant-2',
    });
    mockOrder({ ...currentOrder, restaurantId: 'restaurant-1' });

    const response = await updateOrderStatusRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when a non-admin has no restaurant in context', async () => {
    mockContext({ ...managerContext, restaurantId: null });

    const response = await updateOrderStatusRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not turn the platform-admin path into 404', async () => {
    mockContext({
      ...managerContext,
      userId: 'admin-1',
      userType: 'platform_admin',
      roleTemplate: 'platform_admin',
      restaurantId: null,
      isAdmin: true,
    });
    mockOrder({ ...currentOrder, restaurantId: 'restaurant-2' });

    const response = await updateOrderStatusRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.order.status).toBe('PREPARING');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the USE_CANCEL_ENDPOINT 409 unchanged', async () => {
    const response = await updateOrderStatusRoute(
      request({ status: 'CANCELLED' }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('USE_CANCEL_ENDPOINT');
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
