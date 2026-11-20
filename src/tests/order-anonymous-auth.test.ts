import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import {
  GET as getOrderRoute,
  PATCH as patchOrderRoute,
} from '@/app/api/orders/[id]/route';
import { PATCH as updateOrderStatusRoute } from '@/app/api/orders/[id]/status/route';
import { PATCH as modifyOrderRoute } from '@/app/api/orders/[id]/modify/route';
import { POST as markOrderReadyRoute } from '@/app/api/orders/[id]/ready/route';
import { POST as recallOrderRoute } from '@/app/api/orders/[id]/recall/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
  hasPermission: jest.fn(() => false),
}));

jest.mock('@/lib/database', () => ({
  prisma: {},
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/orders/order-adjustment-http', () => ({
  handleOrderAdjustmentRequest: jest.fn(),
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

jest.mock('@/lib/order-utils', () => ({
  ORDER_STATUS: {
    CONFIRMED: 'CONFIRMED',
    PREPARING: 'PREPARING',
    READY: 'READY',
    SERVED: 'SERVED',
    CANCELLED: 'CANCELLED',
  },
  validateOrderTransition: jest.fn(() => true),
  getInvalidTransitionMessage: jest.fn(() => 'invalid transition'),
  calculateOrderTotals: jest.fn(),
  PAYMENT_STATUS: { PAID: 'PAID' },
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderStatusChange: jest.fn(),
    publishRestaurantNotification: jest.fn(),
    publishOrderItemStatusChange: jest.fn(),
    publishOrderRecallCleared: jest.fn(),
    publishOrderRecalled: jest.fn(),
  },
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderStatusChanged: jest.fn(),
  recordOrderItemStatusChanged: jest.fn(),
  recordOrderRecallCleared: jest.fn(),
  recordOrderRecalled: jest.fn(),
}));

jest.mock('@/lib/restaurant-changes', () => ({
  recordRestaurantChange: jest.fn(),
}));

jest.mock('@/lib/services/order-dispatch-service', () => ({
  confirmPendingOrder: jest.fn(),
  resolveOrderPrintAuthority: jest.fn(),
  OrderDispatchError: class OrderDispatchError extends Error {},
}));

jest.mock('@/lib/client-ip', () => ({
  trustedIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('@/lib/counter/ticket-status', () => ({
  aggregateTicketStatus: jest.fn(),
}));

jest.mock('@/lib/kitchen-actor', () => ({
  kitchenActorAudit: jest.fn(),
  resolveKitchenActor: jest.fn(),
}));

jest.mock('@/lib/recall', () => ({
  clearRecallIfStationReady: jest.fn(),
  resolveOrderStationIds: jest.fn(),
  stationItemIds: jest.fn(),
  getRecallWindowMinutes: jest.fn(() => 10),
  isRecallEnabled: jest.fn(() => true),
  isRecallWindowExpired: jest.fn(() => false),
  RECALL_REASON_MAX_LENGTH: 250,
}));

jest.mock('@/lib/order-idempotency', () => ({
  findReceipt: jest.fn(),
  saveReceipt: jest.fn(),
  idempotencyKeyFrom: jest.fn(() => 'anonymous-test-key'),
  ORDER_ACTION: { ORDER_READY: 'order.ready' },
}));

jest.mock('@/lib/validation/order-modification-schemas', () => ({
  ModifyOrderSchema: { parse: jest.fn() },
}));

jest.mock('@/lib/services/loyalty-order-modify-service', () => ({
  acquireOrderModificationLocks: jest.fn(),
  reapplyPromotionForModifiedOrder: jest.fn(),
}));

const orderId = '550e8400-e29b-41d4-a716-446655440010';

function params() {
  return { params: Promise.resolve({ id: orderId }) };
}

function request(path: string, method = 'PATCH', body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function expectAuthenticationRequired(status: number, body: unknown) {
  expect(status).toBe(401);
  expect(body).toEqual({
    error: 'Authentication required',
    code: 'AUTHENTICATION_REQUIRED',
  });
}

describe('anonymous order requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(null);
    (requireAuth as jest.Mock).mockImplementation(() => {
      throw new Error('Authentication required');
    });
    (requirePermission as jest.Mock).mockReturnValue(undefined);
  });

  it.each([
    [
      'GET /api/orders/{id}',
      () => getOrderRoute(request(`/api/orders/${orderId}`, 'GET'), params()),
    ],
    [
      'PATCH /api/orders/{id}',
      () =>
        patchOrderRoute(
          request(`/api/orders/${orderId}`, 'PATCH', { status: 'PREPARING' }),
          params()
        ),
    ],
    [
      'PATCH /api/orders/{id}/status',
      () =>
        updateOrderStatusRoute(
          request(`/api/orders/${orderId}/status`, 'PATCH', {
            status: 'PREPARING',
          }),
          params()
        ),
    ],
    [
      'PATCH /api/orders/{id}/modify',
      () =>
        modifyOrderRoute(
          request(`/api/orders/${orderId}/modify`, 'PATCH', {}),
          params()
        ),
    ],
    [
      'POST /api/orders/{id}/ready',
      () =>
        markOrderReadyRoute(
          request(`/api/orders/${orderId}/ready`, 'POST', {}),
          params()
        ),
    ],
    [
      'POST /api/orders/{id}/recall',
      () =>
        recallOrderRoute(
          request(`/api/orders/${orderId}/recall`, 'POST', {}),
          params()
        ),
    ],
  ])('%s returns the shared 401', async (_name, invoke) => {
    const response = await invoke();
    expectAuthenticationRequired(response.status, await response.json());
  });

  it('routes the refusal through requireAuth so the anonymous audit event is written', async () => {
    await getOrderRoute(request(`/api/orders/${orderId}`, 'GET'), params());
    expect(requireAuth).toHaveBeenCalledWith(null);

    await modifyOrderRoute(
      request(`/api/orders/${orderId}/modify`, 'PATCH', {}),
      params()
    );
    expect(requireAuth).toHaveBeenCalledWith(null);

    await markOrderReadyRoute(
      request(`/api/orders/${orderId}/ready`, 'POST', {}),
      params()
    );
    expect(requireAuth).toHaveBeenCalledWith(null);

    await recallOrderRoute(
      request(`/api/orders/${orderId}/recall`, 'POST', {}),
      params()
    );
    expect(requireAuth).toHaveBeenCalledWith(null);
  });
});
