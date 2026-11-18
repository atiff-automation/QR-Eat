import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  addOrderItems,
  OrderAddItemsError,
} from '@/lib/orders/order-add-items-service';
import { POST as addItemsRoute } from '@/app/api/orders/[id]/items/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/orders/order-add-items-service', () => {
  const actual = jest.requireActual('@/lib/orders/order-add-items-service');
  return { ...actual, addOrderItems: jest.fn() };
});

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

const body = {
  expectedVersion: 4,
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  reason: 'customer_request',
  reasonNotes: 'extra tea',
  customerNotified: true,
  items: [
    {
      menuItemId: '550e8400-e29b-41d4-a716-446655440020',
      quantity: 1,
      optionIds: [],
      notes: null,
    },
  ],
};

const successResult = {
  order: {
    id: orderId,
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    version: 5,
    subtotalAmount: '24.00',
    taxAmount: '1.20',
    serviceCharge: '2.40',
    discountAmount: '0.00',
    totalAmount: '27.60',
  },
  addedItems: [
    {
      id: 'item-2',
      menuItemId: '550e8400-e29b-41d4-a716-446655440020',
      quantity: 1,
      totalAmount: '6.00',
    },
  ],
  ticket: {
    routed: true,
    stationIds: ['station-1'],
    unroutedItemIds: [],
    replayed: false,
  },
  isDuplicate: false,
  serverTime: '2026-11-18T10:00:00.000Z',
};

function request(payload: unknown = body) {
  return new NextRequest(`http://localhost/api/orders/${orderId}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'counter' },
    body: JSON.stringify(payload),
  });
}

function params() {
  return { params: Promise.resolve({ id: orderId }) };
}

describe('POST /api/orders/{orderId}/items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireOrderAccess as jest.Mock).mockResolvedValue(undefined);
    (addOrderItems as jest.Mock).mockResolvedValue(successResult);
  });

  it('returns the contract add-items response', async () => {
    const response = await addItemsRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, ...successResult });
    expect(requirePermission).toHaveBeenCalledWith(context, 'orders', 'write');
    expect(addOrderItems).toHaveBeenCalledWith(
      'restaurant-1',
      orderId,
      expect.objectContaining({
        userId: 'counter-1',
        userType: 'staff',
        userAgent: 'counter',
      }),
      body
    );
  });

  it('rejects an invalid body with 400 VALIDATION_FAILED', async () => {
    const response = await addItemsRoute(
      request({ ...body, expectedVersion: 0 }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('VALIDATION_FAILED');
    expect(addOrderItems).not.toHaveBeenCalled();
  });

  it('maps a cross-tenant 403 from requireOrderAccess to 404', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Access denied: another restaurant', 'FORBIDDEN', 403)
    );

    const response = await addItemsRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('ORDER_NOT_FOUND');
    expect(addOrderItems).not.toHaveBeenCalled();
  });

  it('maps a missing order to 404 ORDER_NOT_FOUND', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Order not found', 'NOT_FOUND', 404)
    );

    const response = await addItemsRoute(request(), params());

    expect(response.status).toBe(404);
  });

  it.each([
    ['ORDER_NOT_ADDABLE', 409],
    ['PAYMENT_STATE_INVALID', 409],
    ['BUSINESS_DAY_CLOSED', 409],
    ['ORDER_VERSION_CONFLICT', 409],
    ['IDEMPOTENCY_KEY_REUSED', 409],
    ['ORDER_NOT_FOUND', 404],
  ])('maps service error %s to %i', async (code, status) => {
    (addOrderItems as jest.Mock).mockRejectedValue(
      new OrderAddItemsError('failed', code, status)
    );

    const response = await addItemsRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(status);
    expect(json.code).toBe(code);
  });

  it('returns 401 without a session', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(null);
    (requireAuth as jest.Mock).mockImplementation(() => {
      throw new Error('Authentication required');
    });

    const response = await addItemsRoute(request(), params());

    expect(response.status).toBe(401);
    expect(requireOrderAccess).not.toHaveBeenCalled();
  });

  it('returns 403 without orders:write', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied: write on orders');
    });

    const response = await addItemsRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.code).toBe('PERMISSION_DENIED');
    expect(requireOrderAccess).not.toHaveBeenCalled();
    expect(addOrderItems).not.toHaveBeenCalled();
  });

  it('returns 400 when the restaurant context is missing', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue({
      ...context,
      restaurantId: null,
    });
    (requireAuth as jest.Mock).mockReturnValue({
      ...context,
      restaurantId: null,
    });

    const response = await addItemsRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('RESTAURANT_CONTEXT_REQUIRED');
    expect(addOrderItems).not.toHaveBeenCalled();
  });
});
