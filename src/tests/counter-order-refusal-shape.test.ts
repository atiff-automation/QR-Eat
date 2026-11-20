import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { GET as getTicketRoute } from '@/app/api/counter/orders/[orderId]/ticket/route';
import { POST as payRoute } from '@/app/api/counter/orders/[orderId]/pay/route';
import { POST as sendRoute } from '@/app/api/counter/orders/[orderId]/send/route';
import { POST as posPaymentRoute } from '@/app/api/pos/payment/[orderId]/route';

jest.mock('server-only', () => ({}));

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    orderEvent: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: { publishOrderEvent: jest.fn() },
}));

jest.mock('@/lib/services/payment-batch-service', () => ({
  PaymentServiceError: class PaymentServiceError extends Error {},
  processOrderPaymentBatch: jest.fn(),
}));

jest.mock('@/lib/services/order-dispatch-service', () => ({
  OrderDispatchError: class OrderDispatchError extends Error {},
  confirmPendingOrder: jest.fn(),
}));

jest.mock('@/lib/sequence-manager', () => ({
  SequenceManager: jest.fn(),
}));

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

const context = {
  userId: 'counter-1',
  userType: 'staff',
  roleTemplate: 'cashier',
  restaurantId: 'restaurant-1',
  email: 'cashier@example.test',
  permissions: { orders: ['read', 'write'], payments: ['write'] },
  isAdmin: false,
  mustChangePassword: false,
};

const orderId = '550e8400-e29b-41d4-a716-446655440010';

const NOT_FOUND = {
  success: false,
  error: 'Order not found',
  code: 'ORDER_NOT_FOUND',
};

function request(method = 'GET') {
  return new NextRequest(
    `http://localhost/api/counter/orders/${orderId}/ticket`,
    {
      method,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'key-1',
      },
      body: method === 'POST' ? JSON.stringify({}) : undefined,
    }
  );
}

function params() {
  return { params: Promise.resolve({ orderId }) };
}

const routes = [
  ['ticket', () => getTicketRoute(request(), params())],
  ['pay', () => payRoute(request('POST'), params())],
  ['send', () => sendRoute(request('POST'), params())],
  ['pos-payment', () => posPaymentRoute(request('POST'), params())],
] as const;

describe.each(routes)('%s order access refusal shape', (_name, call) => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (requireOrderAccess as jest.Mock).mockResolvedValue(undefined);
  });

  it('maps a cross-tenant 403 to 404 ORDER_NOT_FOUND', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError(
        'Access denied: Order belongs to another restaurant',
        'FORBIDDEN',
        403
      )
    );

    const response = await call();
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
  });

  it('maps a missing order to the identical 404 body', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Order not found', 'NOT_FOUND', 404)
    );

    const response = await call();
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual(NOT_FOUND);
  });
});
