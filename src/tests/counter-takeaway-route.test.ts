import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { counterAccessDenied } from '@/lib/counter/access';
import { GET as getTakeaway } from '@/app/api/counter/takeaway/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findMany: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

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

const money = (value: string) => ({ toString: () => value });

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-TEST-042',
    dailySeq: 42,
    orderType: 'TAKEAWAY',
    customerName: 'Alex',
    customerPhone: '0123456789',
    tableId: null,
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    source: 'COUNTER',
    totalAmount: money('10.00'),
    createdAt: new Date('2026-10-27T12:00:00.000Z'),
    readyAt: null,
    items: [{ quantity: 1, menuItem: { name: 'Nasi Lemak' } }],
    orderEvents: [],
    ...overrides,
  };
}

const request = () => new NextRequest('http://localhost/api/counter/takeaway');

describe('Counter takeaway read endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns the summary, payable flags and unique item names', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      order({
        id: 'pending',
        dailySeq: 42,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalAmount: money('10.00'),
        items: [
          { quantity: 2, menuItem: { name: 'Nasi Lemak' } },
          { quantity: 1, menuItem: { name: 'Teh Tarik' } },
          { quantity: 1, menuItem: { name: 'Nasi Lemak' } },
        ],
        createdAt: new Date('2026-10-27T12:00:00.000Z'),
      }),
      order({
        id: 'confirmed-unpaid',
        dailySeq: 43,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        totalAmount: money('20.00'),
        items: [{ quantity: 1, menuItem: { name: 'Mee Goreng' } }],
        createdAt: new Date('2026-10-27T12:01:00.000Z'),
        orderEvents: [
          {
            printStatus: 'PRINTED',
            printedAt: new Date('2026-10-27T12:01:10.000Z'),
          },
        ],
      }),
      order({
        id: 'ready-unpaid',
        dailySeq: 44,
        status: 'READY',
        paymentStatus: 'PENDING',
        totalAmount: money('30.00'),
        items: [{ quantity: 2, menuItem: { name: 'Roti Canai' } }],
        createdAt: new Date('2026-10-27T12:02:00.000Z'),
        readyAt: new Date('2026-10-27T12:10:00.000Z'),
      }),
      order({
        id: 'served-unpaid',
        dailySeq: 45,
        status: 'SERVED',
        paymentStatus: 'PENDING',
        totalAmount: money('40.00'),
        items: [{ quantity: 1, menuItem: { name: 'Nasi Lemak' } }],
        createdAt: new Date('2026-10-27T12:03:00.000Z'),
      }),
      order({
        id: 'paid-ready',
        dailySeq: 46,
        status: 'READY',
        paymentStatus: 'PAID',
        totalAmount: money('50.00'),
        items: [{ quantity: 1, menuItem: { name: 'Teh Tarik' } }],
        createdAt: new Date('2026-10-27T12:04:00.000Z'),
      }),
      order({
        id: 'paid-waiting',
        dailySeq: 47,
        status: 'PREPARING',
        paymentStatus: 'PAID',
        totalAmount: money('60.00'),
        items: [{ quantity: 1, menuItem: { name: 'Mee Goreng' } }],
        createdAt: new Date('2026-10-27T12:05:00.000Z'),
      }),
    ]);

    const response = await getTakeaway(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary).toEqual({
      openCount: 6,
      unpaidCount: 3,
      readyUnpaidCount: 1,
      recalledCount: 0,
      pendingConfirmCount: 1,
      paidWaitingCount: 1,
      unpaidTotal: '90.00',
    });

    const pending = json.orders.find(
      (row: { id: string }) => row.id === 'pending'
    );
    const confirmed = json.orders.find(
      (row: { id: string }) => row.id === 'confirmed-unpaid'
    );
    const served = json.orders.find(
      (row: { id: string }) => row.id === 'served-unpaid'
    );
    const paidReady = json.orders.find(
      (row: { id: string }) => row.id === 'paid-ready'
    );

    expect(pending).toMatchObject({
      pickupNumber: '#042',
      tableId: null,
      tableNumber: null,
      tableName: null,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      itemCount: 4,
      itemNames: ['Nasi Lemak', 'Teh Tarik'],
      payable: false,
      ticketStatus: 'NOT_ROUTED',
    });
    expect(confirmed).toMatchObject({
      payable: true,
      ticketStatus: 'PRINTED',
      ticketPrintedAt: '2026-10-27T12:01:10.000Z',
    });
    expect(served).toMatchObject({ status: 'SERVED', payable: true });
    expect(paidReady).toMatchObject({ paymentStatus: 'PAID', payable: false });
    expect(json.orders[2]).toMatchObject({
      readyAt: '2026-10-27T12:10:00.000Z',
    });
    expect(json.orders[0].ageSeconds).toBeGreaterThanOrEqual(0);
    expect(json.serverTime).toEqual(expect.any(String));
  });

  it('queries only open takeaway orders for the authenticated restaurant', async () => {
    await getTakeaway(request());

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          restaurantId,
          orderType: 'TAKEAWAY',
          tableId: null,
          status: { not: 'CANCELLED' },
          OR: [
            { paymentStatus: 'PENDING' },
            { status: { in: ['CONFIRMED', 'PREPARING', 'READY'] } },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      })
    );
    expect(requirePermission).toHaveBeenCalledWith(context, 'orders', 'read');
  });

  it('keeps a pending order visible but does not count it as payable', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      order({
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalAmount: money('10.00'),
      }),
    ]);

    const response = await getTakeaway(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary).toEqual({
      openCount: 1,
      unpaidCount: 0,
      readyUnpaidCount: 0,
      recalledCount: 0,
      pendingConfirmCount: 1,
      paidWaitingCount: 0,
      unpaidTotal: '0.00',
    });
    expect(json.orders[0].payable).toBe(false);
  });

  it('includes a served unpaid order because it can still be paid', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      order({
        status: 'SERVED',
        paymentStatus: 'PENDING',
        totalAmount: money('40.00'),
      }),
    ]);

    const response = await getTakeaway(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary.unpaidCount).toBe(1);
    expect(json.orders[0]).toMatchObject({
      status: 'SERVED',
      payable: true,
    });
  });

  it('requires a restaurant context', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue({
      ...context,
      restaurantId: undefined,
    });

    const response = await getTakeaway(request());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Restaurant context is required');
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(null);
    (requireAuth as jest.Mock).mockImplementation(() => {
      throw new Error('Authentication required');
    });

    const response = await getTakeaway(request());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('Authentication required');
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('rejects a request without orders:read permission', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied: read on orders');
    });

    const response = await getTakeaway(request());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('Permission denied');
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('returns the counter access denial unchanged', async () => {
    (counterAccessDenied as jest.Mock).mockReturnValue(
      NextResponse.json(
        { success: false, error: 'Counter role required' },
        { status: 403 }
      )
    );

    const response = await getTakeaway(request());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Counter role required');
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
