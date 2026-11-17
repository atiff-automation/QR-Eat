import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { prisma } from '@/lib/database';
import { GET as getPrintTickets } from '@/app/api/counter/orders/[orderId]/print-tickets/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: { orderEvent: { findMany: jest.fn() } },
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

afterEach(() => {
  jest.clearAllMocks();
  (counterAccessDenied as jest.Mock).mockReturnValue(null);
});

function request() {
  return new NextRequest(
    'http://localhost/api/counter/orders/550e8400-e29b-41d4-a716-446655440010/print-tickets'
  );
}

describe('GET /api/counter/orders/{orderId}/print-tickets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReset();
    (requireOrderAccess as jest.Mock).mockResolvedValue(undefined);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns the contract ticket shape with a verbatim payload', async () => {
    const payload = {
      orderNumber: 'A-0142',
      counterReference: null,
      dailySeq: 142,
      clientOrderId: null,
      paperChitPrinted: false,
      tableName: 'T7',
      orderType: 'DINE_IN',
      pickupNumber: null,
      customerName: null,
      fulfillmentLabel: 'T7',
      orderNote: null,
      items: [
        {
          itemId: 'oi_1',
          name: 'Penne Arrabbiata',
          qty: 1,
          modifiers: [],
          notes: null,
        },
      ],
      stationSubtotal: '19.99',
      fallback: false,
      printMode: 'COUNTER',
    };
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      {
        id: BigInt(40218),
        orderId: '550e8400-e29b-41d4-a716-446655440010',
        stationId: 'st-1',
        type: 'order.created',
        payload,
        printStatus: 'PENDING',
        printAttemptedAt: null,
        printedAt: null,
        printError: null,
        printDeviceId: null,
        station: { name: 'Kitchen', settings: { printMode: 'STATION' } },
      },
      {
        id: BigInt(40219),
        orderId: '550e8400-e29b-41d4-a716-446655440010',
        stationId: 'st-2',
        type: 'order.items.added',
        payload: { printMode: 'STATION' },
        printStatus: null,
        printAttemptedAt: null,
        printedAt: null,
        printError: null,
        printDeviceId: 'device-1',
        station: { name: 'Grill', settings: { printMode: 'STATION' } },
      },
    ]);

    const response = await getPrintTickets(request(), {
      params: Promise.resolve({
        orderId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.orderId).toBe('550e8400-e29b-41d4-a716-446655440010');
    expect(json.tickets).toHaveLength(2);

    expect(json.tickets[0]).toMatchObject({
      eventId: '40218',
      orderId: '550e8400-e29b-41d4-a716-446655440010',
      stationId: 'st-1',
      stationName: 'Kitchen',
      printMode: 'COUNTER',
      type: 'order.created',
      printStatus: 'PENDING',
      printedBy: null,
      canAck: true,
    });
    // The server document is returned verbatim, not rebuilt.
    expect(json.tickets[0].payload).toEqual(payload);

    // A legacy null status is UNKNOWN, never PRINTED.
    expect(json.tickets[1].printStatus).toBe('UNKNOWN');
    expect(json.tickets[1].printMode).toBe('STATION');
    expect(json.tickets[1].printedBy).toBe('DEVICE');
    expect(json.tickets[1].canAck).toBe(false);
    const findArgs = (prisma.orderEvent.findMany as jest.Mock).mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      orderId: '550e8400-e29b-41d4-a716-446655440010',
      restaurantId: 'restaurant-1',
      type: {
        in: ['order.created', 'order.items.added', 'order.cancelled'],
      },
    });
    expect(findArgs.where.type.in).toHaveLength(3);
    expect(findArgs.where.type.in).not.toContain('order.status.changed');
    expect(findArgs.where.type.in).not.toContain('order.item.status.changed');
    expect(findArgs.where.type.in).not.toContain('order.recalled');
    expect(findArgs.where.type.in).not.toContain('order.recall.cleared');
    expect(findArgs.orderBy).toEqual({ id: 'asc' });
  });

  it('returns an empty list as 200, not 404', async () => {
    const response = await getPrintTickets(request(), {
      params: Promise.resolve({
        orderId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tickets).toEqual([]);
  });

  it('drops a non-printable event even if the query returns one', async () => {
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      {
        id: BigInt(40218),
        orderId: '550e8400-e29b-41d4-a716-446655440010',
        stationId: 'st-1',
        type: 'order.created',
        payload: { printMode: 'COUNTER' },
        printStatus: 'PENDING',
        printAttemptedAt: null,
        printedAt: null,
        printError: null,
        printDeviceId: null,
        station: { name: 'Kitchen', settings: { printMode: 'STATION' } },
      },
      {
        id: BigInt(40220),
        orderId: '550e8400-e29b-41d4-a716-446655440010',
        stationId: 'st-1',
        type: 'order.status.changed',
        payload: { from: 'CONFIRMED', to: 'PREPARING' },
        printStatus: null,
        printAttemptedAt: null,
        printedAt: null,
        printError: null,
        printDeviceId: null,
        station: { name: 'Kitchen', settings: { printMode: 'STATION' } },
      },
    ]);

    const response = await getPrintTickets(request(), {
      params: Promise.resolve({
        orderId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tickets).toHaveLength(1);
    expect(json.tickets[0].type).toBe('order.created');
    expect(json.tickets.map((t: { type: string }) => t.type)).not.toContain(
      'order.status.changed'
    );
  });

  it('rejects a non-UUID orderId with 400 VALIDATION_FAILED', async () => {
    const response = await getPrintTickets(request(), {
      params: Promise.resolve({ orderId: 'not-a-uuid' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('VALIDATION_FAILED');
    expect(requireOrderAccess).not.toHaveBeenCalled();
    expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
  });

  it('maps a cross-tenant 403 from requireOrderAccess to 404', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Access denied: another restaurant', 'FORBIDDEN', 403)
    );

    const response = await getPrintTickets(request(), {
      params: Promise.resolve({
        orderId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('ORDER_NOT_FOUND');
    expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
  });

  it('maps a missing order to 404 ORDER_NOT_FOUND', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Order not found', 'NOT_FOUND', 404)
    );

    const response = await getPrintTickets(request(), {
      params: Promise.resolve({
        orderId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('ORDER_NOT_FOUND');
  });

  it('returns 403 for a denied Counter role', async () => {
    const { NextResponse } = jest.requireActual('next/server');
    (counterAccessDenied as jest.Mock).mockReturnValue(
      NextResponse.json(
        { error: 'Counter role required', code: 'COUNTER_ROLE_NOT_ALLOWED' },
        { status: 403 }
      )
    );

    const response = await getPrintTickets(request(), {
      params: Promise.resolve({
        orderId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });

    expect(response.status).toBe(403);
    expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(null);
    const { NextResponse } = jest.requireActual('next/server');
    (counterAccessDenied as jest.Mock).mockReturnValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );

    const response = await getPrintTickets(request(), {
      params: Promise.resolve({
        orderId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 403 PERMISSION_DENIED without orders:read', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied: read on orders');
    });

    const response = await getPrintTickets(request(), {
      params: Promise.resolve({
        orderId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.code).toBe('PERMISSION_DENIED');
    expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
  });
});
