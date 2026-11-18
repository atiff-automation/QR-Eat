import { NextRequest } from 'next/server';
import {
  getTenantContext,
  hasPermission,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import {
  cancelOrderAdjustment,
  refundOrderAdjustment,
  voidOrderAdjustment,
} from '@/lib/orders/order-adjustment-service';
import { OrderAdjustmentError } from '@/lib/orders/order-adjustment-policy';
import { prisma } from '@/lib/database';
import { DELETE as cancelRoute } from '@/app/api/orders/[id]/route';
import { POST as voidRoute } from '@/app/api/orders/[id]/void/route';
import { POST as refundRoute } from '@/app/api/orders/[id]/refund/route';
import { PATCH as statusRoute } from '@/app/api/orders/[id]/status/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  hasPermission: jest.fn(() => false),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/orders/order-adjustment-service', () => {
  const actual = jest.requireActual('@/lib/orders/order-adjustment-service');
  return {
    orderAdjustmentErrorResponse: actual.orderAdjustmentErrorResponse,
    cancelOrderAdjustment: jest.fn(),
    voidOrderAdjustment: jest.fn(),
    refundOrderAdjustment: jest.fn(),
  };
});

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

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderStatusChange: jest.fn(),
    publishRestaurantNotification: jest.fn(),
  },
}));

jest.mock('@/lib/order-events', () => {
  const actual = jest.requireActual('@/lib/order-events');
  return { ...actual, recordOrderStatusChanged: jest.fn() };
});

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

jest.mock('@/lib/restaurant-changes', () => ({
  recordRestaurantChange: jest.fn(),
}));

jest.mock('@/lib/services/order-dispatch-service', () => {
  const actual = jest.requireActual('@/lib/services/order-dispatch-service');
  return { ...actual, confirmPendingOrder: jest.fn() };
});

const context = {
  userId: 'user-1',
  userType: 'staff',
  roleTemplate: 'manager',
  restaurantId: 'restaurant-1',
  email: 'manager@example.test',
  permissions: { orders: ['read', 'write'], payments: ['read', 'write'] },
  isAdmin: false,
  mustChangePassword: false,
};

const body = {
  reason: 'customer_request',
  reasonNotes: 'customer left',
  customerNotified: true,
  version: 3,
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
};

function request(method = 'POST', payload: unknown = body) {
  return new NextRequest(
    'http://localhost/api/orders/550e8400-e29b-41d4-a716-446655440010',
    {
      method,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'counter-test',
      },
      body: JSON.stringify(payload),
    }
  );
}

function params() {
  return {
    params: Promise.resolve({
      id: '550e8400-e29b-41d4-a716-446655440010',
    }),
  };
}

describe('cancellation routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireOrderAccess as jest.Mock).mockResolvedValue(undefined);
    (hasPermission as jest.Mock).mockReturnValue(false);
    (cancelOrderAdjustment as jest.Mock).mockResolvedValue({
      action: 'CANCEL',
      replayed: false,
      orderId: '550e8400-e29b-41d4-a716-446655440010',
      orderStatus: 'CANCELLED',
      paymentStatus: 'PENDING',
      refundAmount: 0,
      message: 'Order cancelled successfully.',
    });
    (voidOrderAdjustment as jest.Mock).mockResolvedValue({
      action: 'VOID',
      replayed: false,
      orderId: '550e8400-e29b-41d4-a716-446655440010',
      orderStatus: 'CANCELLED',
      paymentStatus: 'PENDING',
      refundAmount: 0,
      message: 'Order voided. No payment was refunded.',
    });
    (refundOrderAdjustment as jest.Mock).mockResolvedValue({
      action: 'REFUND',
      replayed: false,
      orderId: '550e8400-e29b-41d4-a716-446655440010',
      orderStatus: 'SERVED',
      paymentStatus: 'REFUNDED',
      refundAmount: 20,
      message: 'Full refund of 20.00 recorded. Order remains served.',
    });
  });

  it('DELETE cancels with the actor IP and user agent', async () => {
    const response = await cancelRoute(request('DELETE'), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      action: 'CANCEL',
      isDuplicate: false,
      refundMessage: 'Order cancelled successfully.',
    });
    expect(cancelOrderAdjustment).toHaveBeenCalledWith(
      'restaurant-1',
      '550e8400-e29b-41d4-a716-446655440010',
      expect.objectContaining({
        userId: 'user-1',
        ipAddress: 'unknown',
        userAgent: 'counter-test',
      }),
      body
    );
  });

  it('DELETE reports a replay as isDuplicate', async () => {
    (cancelOrderAdjustment as jest.Mock).mockResolvedValue({
      action: 'CANCEL',
      replayed: true,
      orderId: '550e8400-e29b-41d4-a716-446655440010',
      orderStatus: 'CANCELLED',
      paymentStatus: 'PENDING',
      refundAmount: 0,
      message: 'This adjustment was already recorded.',
    });

    const response = await cancelRoute(request('DELETE'), params());
    const json = await response.json();

    expect(json.isDuplicate).toBe(true);
    expect(json.refundMessage).toBe('This adjustment was already recorded.');
  });

  it('maps a cross-tenant 403 to 404 for cancel, void and refund', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Access denied', 'FORBIDDEN', 403)
    );

    const cancelled = await cancelRoute(request('DELETE'), params());
    const voided = await voidRoute(request('POST'), params());
    const refunded = await refundRoute(request('POST'), params());

    for (const response of [cancelled, voided, refunded]) {
      const json = await response.json();
      expect(response.status).toBe(404);
      expect(json.code).toBe('ORDER_NOT_FOUND');
    }
    expect(cancelOrderAdjustment).not.toHaveBeenCalled();
    expect(voidOrderAdjustment).not.toHaveBeenCalled();
    expect(refundOrderAdjustment).not.toHaveBeenCalled();
  });

  it('maps a genuinely missing order 404 to ORDER_NOT_FOUND', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Order not found', 'NOT_FOUND', 404)
    );

    const response = await cancelRoute(request('DELETE'), params());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('ORDER_NOT_FOUND');
    expect(cancelOrderAdjustment).not.toHaveBeenCalled();
  });

  it('keeps a genuine permission denial at 403', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied: write on orders');
    });

    const response = await cancelRoute(request('DELETE'), params());

    expect(response.status).toBe(403);
    expect(requireOrderAccess).not.toHaveBeenCalled();
  });

  it('maps service errors to their status and code', async () => {
    (cancelOrderAdjustment as jest.Mock).mockRejectedValue(
      new OrderAdjustmentError(
        'Idempotency key was reused with a different request',
        'IDEMPOTENCY_KEY_REUSED',
        409
      )
    );

    const response = await cancelRoute(request('DELETE'), params());
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects an invalid cancel body with 400', async () => {
    const response = await cancelRoute(
      request('DELETE', { ...body, idempotencyKey: 'not-a-uuid' }),
      params()
    );

    expect(response.status).toBe(400);
    expect(cancelOrderAdjustment).not.toHaveBeenCalled();
  });

  it('rejects PATCH /status CANCELLED before any database access', async () => {
    const response = await statusRoute(
      new NextRequest(
        'http://localhost/api/orders/550e8400-e29b-41d4-a716-446655440010/status',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'CANCELLED' }),
        }
      ),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('USE_CANCEL_ENDPOINT');
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
