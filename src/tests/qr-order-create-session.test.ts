import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { getTableCart, clearTableCart } from '@/lib/table-session';
import { ensureOpenDiningSession } from '@/lib/dining-session';
import { SequenceManager } from '@/lib/sequence-manager';
import { isBusinessDayClosing } from '@/lib/time/business-day-guard';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { calculateOrderTotals, estimateReadyTime } from '@/lib/order-utils';
import { POST as createQrOrder } from '@/app/api/qr/orders/create/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    menuItem: { findMany: jest.fn() },
    customerSession: { update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/table-session', () => ({
  getTableCart: jest.fn(),
  clearTableCart: jest.fn(),
}));

jest.mock('@/lib/dining-session', () => ({
  ensureOpenDiningSession: jest.fn(),
}));

jest.mock('@/lib/sequence-manager', () => ({
  SequenceManager: { getNextOrder: jest.fn() },
}));

jest.mock('@/lib/time/business-day-guard', () => ({
  isBusinessDayClosing: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderCreated: jest.fn(),
    publishTableStatusChange: jest.fn(),
  },
}));

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

jest.mock('@/lib/order-utils', () => ({
  ...jest.requireActual('@/lib/order-utils'),
  calculateOrderTotals: jest.fn(),
  estimateReadyTime: jest.fn(),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';
const diningSessionId = '550e8400-e29b-41d4-a716-446655440004';

const table = {
  id: tableId,
  tableNumber: '1',
  tableName: 'Window Table',
  status: 'AVAILABLE',
  restaurantId,
  restaurant: {
    id: restaurantId,
    taxRate: new Prisma.Decimal('0.10'),
    serviceChargeRate: new Prisma.Decimal('0'),
    taxLabel: 'Tax',
    serviceChargeLabel: 'Service Charge',
    isActive: true,
  },
};

const cart = {
  sessionId,
  items: [
    {
      id: 'cart-item-1',
      menuItemId: '550e8400-e29b-41d4-a716-446655440005',
      quantity: 1,
      unitPrice: 10,
      subtotal: 10,
      specialInstructions: null,
      selectedOptions: [],
    },
  ],
  totalItems: 1,
  totalAmount: 10,
};

const createdOrder = {
  id: 'order-1',
  orderNumber: 'ORD-1',
  dailySeq: 1,
  status: 'PENDING',
  paymentStatus: 'PENDING',
  totalAmount: new Prisma.Decimal('10.60'),
  subtotalAmount: new Prisma.Decimal('10.00'),
  taxAmount: new Prisma.Decimal('0.60'),
  serviceCharge: new Prisma.Decimal('0'),
  taxLabelSnapshot: 'Tax',
  serviceChargeLabelSnapshot: 'Service Charge',
  taxRateSnapshot: new Prisma.Decimal('0.10'),
  serviceChargeRateSnapshot: new Prisma.Decimal('0'),
  estimatedReadyTime: new Date('2026-11-02T12:10:00.000Z'),
};

const tx = {
  customerSession: { update: jest.fn() },
  order: { create: jest.fn() },
  orderItem: { create: jest.fn() },
  orderItemOption: { createMany: jest.fn() },
  table: { update: jest.fn() },
};

describe('QR order create dining session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table);
    (prisma.menuItem.findMany as jest.Mock).mockResolvedValue([
      {
        id: cart.items[0].menuItemId,
        name: 'Nasi Lemak',
        price: new Prisma.Decimal('10.00'),
        preparationTime: 10,
        imageUrl: null,
        description: null,
        allergens: [],
        dietaryInfo: [],
        isAvailable: true,
        isFeatured: false,
        displayOrder: 0,
        costPrice: null,
        calories: null,
      },
    ]);
    (prisma.customerSession.update as jest.Mock).mockResolvedValue({});
    (getTableCart as jest.Mock).mockResolvedValue(cart);
    (clearTableCart as jest.Mock).mockResolvedValue(undefined);
    (ensureOpenDiningSession as jest.Mock).mockResolvedValue({
      id: diningSessionId,
    });
    (isBusinessDayClosing as jest.Mock).mockResolvedValue(false);
    (SequenceManager.getNextOrder as jest.Mock).mockResolvedValue({
      number: 1,
      formatted: 'ORD-1',
    });
    (calculateOrderTotals as jest.Mock).mockReturnValue({
      subtotal: 10,
      taxAmount: 0.6,
      serviceCharge: 0,
      totalAmount: 10.6,
    });
    (estimateReadyTime as jest.Mock).mockReturnValue(
      new Date('2026-11-02T12:10:00.000Z')
    );
    (PostgresEventManager.publishOrderCreated as jest.Mock).mockResolvedValue(
      undefined
    );
    (
      PostgresEventManager.publishTableStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
    (autoUpdateTableStatus as jest.Mock).mockResolvedValue(undefined);

    tx.customerSession.update.mockResolvedValue({});
    tx.order.create.mockResolvedValue(createdOrder);
    tx.orderItem.create.mockResolvedValue({ id: 'item-1' });
    tx.orderItemOption.createMany.mockResolvedValue({});
    tx.table.update.mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
  });

  it('attaches the QR order to the table dining session', async () => {
    const request = new NextRequest('http://localhost/api/qr/orders/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tableId }),
    });

    const response = await createQrOrder(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(ensureOpenDiningSession).toHaveBeenCalledWith(tx, tableId);
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tableId,
          customerSessionId: sessionId,
          diningSessionId,
        }),
      })
    );
    expect(tx.table.update).not.toHaveBeenCalled();
    expect(clearTableCart).toHaveBeenCalledWith(tableId);
  });
});
