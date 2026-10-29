import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import {
  cancelOrderAdjustment,
  refundOrderAdjustment,
  voidOrderAdjustment,
} from '@/lib/orders/order-adjustment-service';
import { SequenceManager } from '@/lib/sequence-manager';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findFirst: jest.fn() },
    orderModification: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/orders/order-business-day', () => ({
  isOrderBusinessDayClosed: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/lib/sequence-manager', () => ({
  SequenceManager: { getNextReceipt: jest.fn() },
}));

jest.mock('@/lib/table-status-manager', () => ({
  autoUpdateTableStatus: jest.fn(),
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderStatusChanged: jest.fn(),
}));

jest.mock('@/lib/rbac/audit-logger', () => ({
  AuditLogger: { logSecurityEvent: jest.fn() },
}));

const actor = {
  userId: 'user-1',
  userType: 'staff',
  roleTemplate: 'manager',
  permissions: { orders: ['read', 'write'], payments: ['read', 'write'] },
};

const input = {
  reason: 'customer_request' as const,
  reasonNotes: 'test',
  customerNotified: true,
  version: 3,
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    restaurantId: 'restaurant-1',
    orderNumber: 'ORD-1',
    status: 'SERVED',
    paymentStatus: 'PENDING',
    orderType: 'DINE_IN',
    tableId: 'table-1',
    totalAmount: new Prisma.Decimal('20.00'),
    createdAt: new Date('2026-10-28T01:00:00.000Z'),
    version: 3,
    payments: [],
    ...overrides,
  };
}

function tx() {
  return {
    order: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    orderModification: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    payment: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('order adjustment service', () => {
  const transactionClient = tx();

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(order());
    (prisma.orderModification.findUnique as jest.Mock).mockResolvedValue(null);
    transactionClient.order.findFirst.mockResolvedValue(order());
    transactionClient.orderModification.findUnique.mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof transactionClient) => unknown) =>
        callback(transactionClient)
    );
    (SequenceManager.getNextReceipt as jest.Mock).mockResolvedValue({
      number: 1,
      formatted: 'RCP-REFUND-1',
    });
  });

  it('voids a served unpaid order without creating a refund', async () => {
    const result = await voidOrderAdjustment(
      'restaurant-1',
      'order-1',
      actor,
      input
    );

    expect(result.action).toBe('VOID');
    expect(result.orderStatus).toBe('CANCELLED');
    expect(result.refundAmount).toBe(0);
    expect(transactionClient.payment.create).not.toHaveBeenCalled();
    expect(transactionClient.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      })
    );
  });

  it('refunds a served paid order without cancelling it', async () => {
    const paidOrder = order({
      paymentStatus: 'PAID',
      payments: [
        {
          id: 'payment-1',
          paymentMethod: 'cash',
          amount: new Prisma.Decimal('20.00'),
          status: 'PAID',
        },
      ],
    });
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(paidOrder);
    transactionClient.order.findFirst.mockResolvedValue(paidOrder);

    const result = await refundOrderAdjustment(
      'restaurant-1',
      'order-1',
      actor,
      input
    );

    expect(result.action).toBe('REFUND');
    expect(result.orderStatus).toBe('SERVED');
    expect(result.refundAmount).toBe(20);
    expect(transactionClient.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: -20,
          status: 'PAID',
          paymentMethod: 'cash',
        }),
      })
    );
    expect(transactionClient.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentStatus: 'REFUNDED' }),
      })
    );
    expect(transactionClient.order.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      })
    );
  });

  it('rejects cancelling a served paid order', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(
      order({
        paymentStatus: 'PAID',
        payments: [
          {
            id: 'payment-1',
            paymentMethod: 'cash',
            amount: new Prisma.Decimal('20.00'),
            status: 'PAID',
          },
        ],
      })
    );

    await expect(
      cancelOrderAdjustment('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({ code: 'ORDER_ADJUSTMENT_NOT_ALLOWED' });
  });
});
