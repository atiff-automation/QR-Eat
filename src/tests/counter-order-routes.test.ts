import { NextRequest } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import {
  createCounterOrder,
  quoteCounterOrder,
} from '@/lib/services/counter-order-service';
import {
  GET as counterOrdersGet,
  POST as counterOrdersPost,
} from '@/app/api/counter/orders/route';
import { POST as counterQuotePost } from '@/app/api/counter/orders/quote/route';
import { GET as counterPendingGet } from '@/app/api/counter/pending/route';

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
    order: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/services/counter-order-service', () => {
  const actual = jest.requireActual('@/lib/services/counter-order-service');
  return {
    ...actual,
    createCounterOrder: jest.fn(),
    quoteCounterOrder: jest.fn(),
  };
});

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const itemId = '550e8400-e29b-41d4-a716-446655440003';

const context = {
  userId: 'user-1',
  userType: 'staff',
  roleTemplate: 'cashier',
  restaurantId,
  email: 'cashier@example.com',
  isAdmin: false,
};

const takeawayInput = {
  orderType: 'TAKEAWAY',
  customerName: 'Alex',
  items: [{ menuItemId: itemId, quantity: 1 }],
};

const quote = {
  valid: true,
  issues: [],
  orderType: 'TAKEAWAY',
  tableId: null,
  tableNumber: null,
  tableName: null,
  customerName: 'Alex',
  customerPhone: null,
  currency: 'MYR',
  taxLabel: 'Tax',
  serviceChargeLabel: 'Service Charge',
  lines: [],
  subtotal: 10,
  taxAmount: 0.6,
  serviceCharge: 0,
  totalAmount: 10.6,
  estimatedReadyTime: '2026-10-27T12:10:00.000Z',
};

function postRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('Counter takeaway API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (quoteCounterOrder as jest.Mock).mockResolvedValue(quote);
    (createCounterOrder as jest.Mock).mockResolvedValue({
      order: {
        id: 'order-1',
        orderNumber: 'ORD-TEST-042',
        orderType: 'TAKEAWAY',
        pickupNumber: '#042',
        tableId: null,
        tableNumber: null,
        tableName: null,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        source: 'COUNTER',
        totalAmount: '10.60',
        customerName: 'Alex',
        customerPhone: null,
        createdAt: '2026-10-27T12:00:00.000Z',
      },
      ticket: null,
      warning: null,
      replayed: false,
    });
  });

  it('quotes takeaway without a table access check', async () => {
    const response = await counterQuotePost(
      postRequest('/api/counter/orders/quote', takeawayInput)
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.quote.orderType).toBe('TAKEAWAY');
    expect(quoteCounterOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderType: 'TAKEAWAY' }),
      expect.objectContaining({ restaurantId })
    );
    expect(requireTableAccess).not.toHaveBeenCalled();
  });

  it('checks table access for a dine-in quote', async () => {
    (quoteCounterOrder as jest.Mock).mockResolvedValue({
      ...quote,
      orderType: 'DINE_IN',
      tableId,
      tableNumber: '2',
    });

    const response = await counterQuotePost(
      postRequest('/api/counter/orders/quote', {
        orderType: 'DINE_IN',
        tableId,
        items: takeawayInput.items,
      })
    );

    expect(response.status).toBe(200);
    expect(requireTableAccess).toHaveBeenCalledWith(tableId, context);
  });

  it('creates takeaway without a table access check', async () => {
    const response = await counterOrdersPost(
      postRequest('/api/counter/orders', takeawayInput, {
        'idempotency-key': 'takeaway-key-123',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.order.orderType).toBe('TAKEAWAY');
    expect(json.order.pickupNumber).toBe('#042');
    expect(requireTableAccess).not.toHaveBeenCalled();
  });

  it('returns nullable table data and takeaway fields in the pending list', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: 'ORD-TEST-042',
        dailySeq: 42,
        orderType: 'TAKEAWAY',
        customerName: 'Alex',
        customerPhone: '0123456789',
        tableId: null,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        source: 'COUNTER',
        totalAmount: { toString: () => '10.60' },
        createdAt: new Date('2026-10-27T12:00:00.000Z'),
        takenByStaff: null,
        table: null,
        items: [{ quantity: 1 }],
      },
    ]);

    const response = await counterPendingGet(
      new NextRequest('http://localhost/api/counter/pending')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.orders[0]).toMatchObject({
      orderType: 'TAKEAWAY',
      pickupNumber: '#042',
      customerName: 'Alex',
      customerPhone: '0123456789',
      tableId: null,
      tableNumber: null,
      tableName: null,
    });
  });

  it('returns nullable table data in the active order list', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: 'ORD-TEST-042',
        dailySeq: 42,
        orderType: 'TAKEAWAY',
        customerName: 'Alex',
        customerPhone: null,
        tableId: null,
        status: 'PREPARING',
        paymentStatus: 'PENDING',
        source: 'COUNTER',
        totalAmount: { toString: () => '10.60' },
        createdAt: new Date('2026-10-27T12:00:00.000Z'),
        readyAt: null,
        table: null,
        items: [{ quantity: 1 }],
        orderEvents: [],
      },
    ]);

    const response = await counterOrdersGet(
      new NextRequest('http://localhost/api/counter/orders?scope=active')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.orders[0]).toMatchObject({
      orderType: 'TAKEAWAY',
      pickupNumber: '#042',
      tableId: null,
      tableNumber: null,
      tableName: null,
    });
  });
});
