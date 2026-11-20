import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { prisma } from '@/lib/database';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { isOrderBusinessDayClosed } from '@/lib/orders/order-business-day';
import { getOrderAdjustmentPolicy } from '@/lib/orders/order-adjustment-policy';
import {
  GET as getOrderRoute,
  PATCH as patchOrderRoute,
} from '@/app/api/orders/[id]/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    staff: { findUnique: jest.fn() },
    restaurantOwner: { findUnique: jest.fn() },
    platformAdmin: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

jest.mock('@/lib/orders/order-business-day', () => ({
  isOrderBusinessDayClosed: jest.fn(),
}));

jest.mock('@/lib/orders/order-adjustment-policy', () => ({
  getOrderAdjustmentPolicy: jest.fn(),
}));

const context = {
  userId: 'counter-1',
  userType: 'staff',
  roleTemplate: 'cashier',
  restaurantId: 'restaurant-1',
  email: 'cashier@example.test',
  permissions: { orders: ['read', 'write'] },
  isAdmin: false,
  mustChangePassword: false,
};

const orderId = '550e8400-e29b-41d4-a716-446655440010';

const NOT_FOUND = {
  success: false,
  error: 'Order not found',
  code: 'ORDER_NOT_FOUND',
};

const order = {
  id: orderId,
  restaurantId: 'restaurant-1',
  status: 'CONFIRMED',
  paymentStatus: 'PENDING',
  orderType: 'TAKEAWAY',
  createdAt: new Date('2026-11-20T00:00:00.000Z'),
  tableId: null,
  table: null,
  customerSession: null,
  orderRecalls: [],
  modifications: [],
  items: [],
  payments: [],
};

function request(method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost/api/orders/${orderId}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: orderId }) };
}

function mockSuccessPath() {
  (getTenantContext as jest.Mock).mockResolvedValue(context);
  (requireAuth as jest.Mock).mockReturnValue(context);
  (requirePermission as jest.Mock).mockReturnValue(undefined);
  (requireOrderAccess as jest.Mock).mockResolvedValue(undefined);
  (prisma.order.findUnique as jest.Mock).mockResolvedValue(order);
  (isOrderBusinessDayClosed as jest.Mock).mockResolvedValue(false);
  (getOrderAdjustmentPolicy as jest.Mock).mockReturnValue({
    action: 'NONE',
    allowed: false,
    reason: 'Not allowed',
  });
  (autoUpdateTableStatus as jest.Mock).mockResolvedValue(undefined);
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (tx: unknown) => unknown) =>
      callback({
        order: {
          update: jest
            .fn()
            .mockResolvedValue({ ...order, status: 'PREPARING' }),
        },
      })
  );
}

describe('GET /api/orders/{id}', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSuccessPath();
  });

  it('returns the own-tenant order unchanged', async () => {
    const response = await getOrderRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.order.id).toBe(orderId);
    expect(requireOrderAccess).toHaveBeenCalledWith(orderId, context);
  });

  it('maps a cross-tenant 403 to 404 ORDER_NOT_FOUND', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError(
        'Access denied: Order belongs to another restaurant',
        'FORBIDDEN',
        403
      )
    );

    const response = await getOrderRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('maps a missing order to the identical 404 body', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Order not found', 'NOT_FOUND', 404)
    );

    const cross = await getOrderRoute(request(), params());
    const missing = await getOrderRoute(request(), params());

    const crossBody = await cross.json();
    const missingBody = await missing.json();

    expect(cross.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(missingBody).toEqual(crossBody);
    expect(missingBody).toEqual(NOT_FOUND);
  });

  it('keeps a permission denial at 403 before resource access', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied: read on orders');
    });

    const response = await getOrderRoute(request(), params());

    expect(response.status).toBe(403);
    expect(requireOrderAccess).not.toHaveBeenCalled();
  });

  it('gives a platform admin the not-found shape', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue({
      ...context,
      isAdmin: true,
    });
    (requireAuth as jest.Mock).mockReturnValue({ ...context, isAdmin: true });
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError(
        'Platform admins cannot access restaurant business data',
        'BUSINESS_DATA_FORBIDDEN',
        403
      )
    );

    const response = await getOrderRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
  });

  it('keeps an unexpected failure at 500', async () => {
    (prisma.order.findUnique as jest.Mock).mockRejectedValue(
      new Error('database down')
    );

    const response = await getOrderRoute(request(), params());

    expect(response.status).toBe(500);
  });
});

describe('PATCH /api/orders/{id}', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSuccessPath();
  });

  it('updates the own-tenant order unchanged', async () => {
    const response = await patchOrderRoute(
      request('PATCH', { status: 'PREPARING' }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.order.status).toBe('PREPARING');
    expect(requireOrderAccess).toHaveBeenCalledWith(orderId, context);
  });

  it('maps a cross-tenant 403 to 404 ORDER_NOT_FOUND', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError(
        'Access denied: Order belongs to another restaurant',
        'FORBIDDEN',
        403
      )
    );

    const response = await patchOrderRoute(
      request('PATCH', { status: 'PREPARING' }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps a missing order to the identical 404 body', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Order not found', 'NOT_FOUND', 404)
    );

    const cross = await patchOrderRoute(
      request('PATCH', { status: 'PREPARING' }),
      params()
    );
    const missing = await patchOrderRoute(
      request('PATCH', { status: 'PREPARING' }),
      params()
    );

    expect(cross.status).toBe(404);
    expect(missing.status).toBe(404);
    const crossBody = await cross.json();
    const missingBody = await missing.json();
    expect(missingBody).toEqual(crossBody);
    expect(missingBody).toEqual(NOT_FOUND);
  });

  it('keeps a permission denial at 403 before resource access', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied: write on orders');
    });

    const response = await patchOrderRoute(
      request('PATCH', { status: 'PREPARING' }),
      params()
    );

    expect(response.status).toBe(403);
    expect(requireOrderAccess).not.toHaveBeenCalled();
  });

  it('gives a platform admin the not-found shape', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue({
      ...context,
      isAdmin: true,
    });
    (requireAuth as jest.Mock).mockReturnValue({ ...context, isAdmin: true });
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError(
        'Platform admins cannot access restaurant business data',
        'BUSINESS_DATA_FORBIDDEN',
        403
      )
    );

    const response = await patchOrderRoute(
      request('PATCH', { status: 'PREPARING' }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
  });

  it('keeps validation at 400', async () => {
    const response = await patchOrderRoute(request('PATCH', {}), params());

    expect(response.status).toBe(400);
  });
});
