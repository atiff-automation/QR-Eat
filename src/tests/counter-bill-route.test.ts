import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { GET as getBill } from '@/app/api/counter/tables/[tableId]/bill/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireTableAccess: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    order: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    diningSession: { findFirst: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: {},
  isAdmin: false,
  roleTemplate: 'restaurant_owner',
  mustChangePassword: false,
};

const table = {
  id: tableId,
  tableNumber: '1',
  tableName: 'Window Table',
  status: 'OCCUPIED',
  restaurantId,
  activeDiningSessionId: sessionId,
  restaurant: {
    currency: 'MYR',
    taxLabel: 'Tax',
    serviceChargeLabel: 'Service Charge',
  },
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-1',
    tableId,
    restaurantId,
    customerSessionId: 'customer-session-1',
    status: 'PREPARING',
    paymentStatus: 'PAID',
    source: 'COUNTER',
    orderType: 'DINE_IN',
    totalAmount: new Prisma.Decimal('15.00'),
    subtotalAmount: new Prisma.Decimal('15.00'),
    taxAmount: new Prisma.Decimal('0'),
    serviceCharge: new Prisma.Decimal('0'),
    createdAt: new Date('2026-11-01T12:20:00.000Z'),
    servedAt: null,
    items: [],
    payments: [
      {
        paymentMethod: 'card',
        receiptNumber: 'RCP-1',
        processedAt: new Date('2026-11-01T12:25:00.000Z'),
        completedAt: null,
        createdAt: new Date('2026-11-01T12:25:00.000Z'),
        status: 'PAID',
      },
    ],
    ...overrides,
  };
}

function request(version?: string) {
  const suffix = version ? `?version=${version}` : '';
  return new NextRequest(
    `http://localhost/api/counter/tables/${tableId}/bill${suffix}`
  );
}

describe('Counter table bill endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (requireTableAccess as jest.Mock).mockResolvedValue(undefined);
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table);
  });

  it('keeps the v1 unpaid-only contract', async () => {
    const unpaid = order({
      id: 'unpaid',
      status: 'PREPARING',
      paymentStatus: 'PENDING',
      totalAmount: new Prisma.Decimal('20.00'),
      subtotalAmount: new Prisma.Decimal('20.00'),
      payments: [],
    });
    (prisma.order.findMany as jest.Mock).mockResolvedValue([unpaid]);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal('15.00') },
    });
    (prisma.order.count as jest.Mock).mockResolvedValue(1);

    const response = await getBill(request(), {
      params: Promise.resolve({ tableId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.version).toBeUndefined();
    expect(json.orders).toHaveLength(1);
    expect(json.orders[0].id).toBe('unpaid');
    expect(json.unpaidTotal).toBe(20);
    expect(json.paidTotal).toBe(15);
    expect(json.blockingOrderCount).toBe(1);
    expect(prisma.diningSession.findFirst).not.toHaveBeenCalled();
  });

  it('returns all current-session orders for v2', async () => {
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      status: 'OPEN',
      openedAt: new Date('2026-11-01T12:00:00.000Z'),
      closedAt: null,
    });
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      order({
        id: 'paid-preparing',
        status: 'PREPARING',
        paymentStatus: 'PAID',
        totalAmount: new Prisma.Decimal('15.00'),
        subtotalAmount: new Prisma.Decimal('15.00'),
      }),
      order({
        id: 'served-paid',
        status: 'SERVED',
        paymentStatus: 'PAID',
        totalAmount: new Prisma.Decimal('25.00'),
        subtotalAmount: new Prisma.Decimal('25.00'),
        servedAt: new Date('2026-11-01T12:40:00.000Z'),
      }),
      order({
        id: 'served-unpaid',
        status: 'SERVED',
        paymentStatus: 'PENDING',
        totalAmount: new Prisma.Decimal('5.00'),
        subtotalAmount: new Prisma.Decimal('5.00'),
        items: [],
        payments: [],
      }),
      order({
        id: 'cancelled',
        status: 'CANCELLED',
        paymentStatus: 'PENDING',
        totalAmount: new Prisma.Decimal('9.00'),
        subtotalAmount: new Prisma.Decimal('9.00'),
        payments: [],
      }),
    ]);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: null },
    });

    const response = await getBill(request('2'), {
      params: Promise.resolve({ tableId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.version).toBe(2);
    expect(json.session).toMatchObject({
      id: sessionId,
      status: 'OPEN',
    });
    expect(json.orders).toHaveLength(4);
    expect(
      json.orders.find((row: { id: string }) => row.id === 'cancelled')
    ).toMatchObject({ status: 'CANCELLED' });
    expect(json.orders[0]).toMatchObject({
      id: 'paid-preparing',
      paymentMethod: 'card',
      receiptNumber: 'RCP-1',
      payable: false,
      isPending: false,
    });
    expect(
      json.orders.find((row: { id: string }) => row.id === 'served-unpaid')
    ).toMatchObject({
      payable: true,
      paymentMethod: null,
    });
    expect(json.totals).toEqual({
      subtotal: '45.00',
      tax: '0.00',
      serviceCharge: '0.00',
      paid: '40.00',
      unpaid: '5.00',
    });
    expect(json.counts).toMatchObject({
      open: 2,
      served: 1,
      all: 4,
      unpaid: 1,
      preparing: 1,
      ready: 0,
      pending: 0,
    });
    expect(json.blockingOrderCount).toBe(2);
    expect(json.readyToClear).toBe(false);
  });

  it('reports ready to clear when every billable order is paid and served', async () => {
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      status: 'OPEN',
      openedAt: new Date('2026-11-01T12:00:00.000Z'),
      closedAt: null,
    });
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      order({
        id: 'served-paid',
        status: 'SERVED',
        paymentStatus: 'PAID',
      }),
    ]);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalAmount: null },
    });

    const response = await getBill(request('2'), {
      params: Promise.resolve({ tableId }),
    });
    const json = await response.json();

    expect(json.readyToClear).toBe(true);
    expect(json.blockingOrderCount).toBe(0);
    expect(json.totals.unpaid).toBe('0.00');
  });

  it('returns an empty v2 bill when the table has no open session', async () => {
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await getBill(request('2'), {
      params: Promise.resolve({ tableId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.version).toBe(2);
    expect(json.session).toBeNull();
    expect(json.orders).toEqual([]);
    expect(json.readyToClear).toBe(false);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
