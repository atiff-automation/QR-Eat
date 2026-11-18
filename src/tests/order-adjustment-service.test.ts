import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import {
  cancelOrderAdjustment,
  refundOrderAdjustment,
  voidOrderAdjustment,
} from '@/lib/orders/order-adjustment-service';
import { buildOrderMutationRequestHash } from '@/lib/orders/order-mutation-idempotency';
import { recordOrderStatusChanged } from '@/lib/order-events';
import { recordRestaurantChangeTx } from '@/lib/restaurant-changes';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SequenceManager } from '@/lib/sequence-manager';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findFirst: jest.fn() },
    orderModification: { findUnique: jest.fn() },
    orderMutationIdempotency: { findUnique: jest.fn() },
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

jest.mock('@/lib/restaurant-changes', () => ({
  recordRestaurantChangeTx: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderCancelled: jest.fn(),
    publishOrderStatusChange: jest.fn(),
  },
}));

jest.mock('@/lib/rbac/audit-logger', () => ({
  AuditLogger: { logSecurityEvent: jest.fn().mockResolvedValue(undefined) },
}));

const actor = {
  userId: 'user-1',
  userType: 'staff',
  roleTemplate: 'manager',
  permissions: { orders: ['read', 'write'], payments: ['read', 'write'] },
  ipAddress: '203.0.113.10',
  userAgent: 'counter-test',
};

const input = {
  reason: 'customer_request' as const,
  reasonNotes: 'test note',
  customerNotified: true,
  version: 3,
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    restaurantId: 'restaurant-1',
    orderNumber: 'ORD-1',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    orderType: 'DINE_IN',
    tableId: 'table-1',
    diningSessionId: null,
    customerId: null,
    subtotalAmount: new Prisma.Decimal('20.00'),
    taxAmount: new Prisma.Decimal('1.20'),
    serviceCharge: new Prisma.Decimal('2.00'),
    discountAmount: new Prisma.Decimal('0.00'),
    totalAmount: new Prisma.Decimal('23.20'),
    createdAt: new Date('2026-11-18T01:00:00.000Z'),
    version: 3,
    payments: [],
    ...overrides,
  };
}

function hashFor(inputOverrides: Record<string, unknown> = {}) {
  return buildOrderMutationRequestHash('CANCEL', 'order-1', {
    version: input.version,
    reason: input.reason,
    reasonNotes: input.reasonNotes,
    customerNotified: input.customerNotified,
    ...inputOverrides,
  });
}

describe('order adjustment service (B3-S cancellation)', () => {
  let currentOrder: ReturnType<typeof order>;
  let tx: {
    order: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    orderModification: { findUnique: jest.Mock; create: jest.Mock };
    orderMutationIdempotency: { findUnique: jest.Mock; create: jest.Mock };
    payment: { create: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    currentOrder = order();

    tx = {
      order: {
        findFirst: jest.fn().mockImplementation(async () => currentOrder),
        updateMany: jest.fn().mockImplementation(async ({ data }) => {
          currentOrder = {
            ...currentOrder,
            status: data.status ?? currentOrder.status,
            paymentStatus: data.paymentStatus ?? currentOrder.paymentStatus,
            version: currentOrder.version + 1,
          };
          return { count: 1 };
        }),
        findUnique: jest.fn().mockImplementation(async () => currentOrder),
      },
      orderModification: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      orderMutationIdempotency: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      payment: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    (prisma.order.findFirst as jest.Mock).mockImplementation(
      async () => currentOrder
    );
    (prisma.orderModification.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.orderMutationIdempotency.findUnique as jest.Mock).mockResolvedValue(
      null
    );
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
    (SequenceManager.getNextReceipt as jest.Mock).mockResolvedValue({
      number: 1,
      formatted: 'RCP-REFUND-1',
    });
    (recordOrderStatusChanged as jest.Mock).mockResolvedValue(1);
    (recordRestaurantChangeTx as jest.Mock).mockResolvedValue(undefined);
    (autoUpdateTableStatus as jest.Mock).mockResolvedValue(undefined);
    (PostgresEventManager.publishOrderCancelled as jest.Mock).mockResolvedValue(
      undefined
    );
    (
      PostgresEventManager.publishOrderStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
  });

  it('cancels once with a chit, change row, audit and post-commit signal', async () => {
    const result = await cancelOrderAdjustment(
      'restaurant-1',
      'order-1',
      actor,
      input
    );

    expect(result).toMatchObject({
      action: 'CANCEL',
      replayed: false,
      orderStatus: 'CANCELLED',
      refundAmount: 0,
    });
    expect(tx.orderModification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: `CANCEL:order-1:${input.idempotencyKey}`,
        }),
      })
    );
    expect(recordOrderStatusChanged).toHaveBeenCalledWith(
      'order-1',
      'CONFIRMED',
      'CANCELLED',
      expect.objectContaining({
        tx,
        reason: 'customer_request',
        cancelledTotals: {
          subtotal: '20.00',
          taxAmount: '1.20',
          serviceCharge: '2.00',
          discountAmount: '0.00',
          totalAmount: '23.20',
        },
      })
    );
    expect(recordRestaurantChangeTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        entityType: 'order',
        entityId: 'order-1',
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.orderMutationIdempotency.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: 'restaurant-1',
          orderId: 'order-1',
          operation: 'CANCEL',
          idempotencyKey: input.idempotencyKey,
        }),
      })
    );
    expect(PostgresEventManager.publishOrderCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
        orderNumber: 'ORD-1',
        orderVersion: 4,
        ticketCount: 1,
      })
    );
    expect(
      PostgresEventManager.publishOrderStatusChange
    ).not.toHaveBeenCalled();
    // Durable audit is primary; the security-event stream is kept as a
    // best-effort post-commit signal.
    expect(AuditLogger.logSecurityEvent).toHaveBeenCalledWith(
      'user-1',
      'ORDER_CANCELLED',
      'high',
      'CANCEL for order order-1',
      expect.objectContaining({
        ipAddress: '203.0.113.10',
        metadata: expect.objectContaining({
          orderId: 'order-1',
          action: 'CANCEL',
          reason: 'customer_request',
        }),
      })
    );
  });

  it('rolls back when the version-conditional cancellation write loses the race', async () => {
    currentOrder = order({
      paymentStatus: 'PAID',
      payments: [
        {
          id: 'payment-1',
          paymentMethod: 'cash',
          amount: new Prisma.Decimal('23.20'),
          status: 'PAID',
        },
      ],
    });
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      cancelOrderAdjustment('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({
      code: 'ORDER_VERSION_CONFLICT',
      statusCode: 409,
    });

    // The refund was staged before the failed claim; a real Prisma
    // transaction rolls it back. No post-commit effect may run.
    expect(tx.payment.create).toHaveBeenCalled();
    expect(tx.orderMutationIdempotency.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(recordRestaurantChangeTx).not.toHaveBeenCalled();
    expect(AuditLogger.logSecurityEvent).not.toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderCancelled).not.toHaveBeenCalled();
  });

  it('records no chit for a PENDING order with no ticket but still publishes', async () => {
    currentOrder = order({ status: 'PENDING' });
    (recordOrderStatusChanged as jest.Mock).mockResolvedValue(0);

    await cancelOrderAdjustment('restaurant-1', 'order-1', actor, input);

    expect(recordOrderStatusChanged).toHaveBeenCalledWith(
      'order-1',
      'PENDING',
      'CANCELLED',
      expect.any(Object)
    );
    expect(PostgresEventManager.publishOrderCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ ticketCount: 0 })
    );
  });

  it('refunds a paid cancellation inside the same transaction', async () => {
    currentOrder = order({
      paymentStatus: 'PAID',
      payments: [
        {
          id: 'payment-1',
          paymentMethod: 'cash',
          amount: new Prisma.Decimal('23.20'),
          status: 'PAID',
        },
      ],
    });

    const result = await cancelOrderAdjustment(
      'restaurant-1',
      'order-1',
      actor,
      input
    );

    expect(result.refundAmount).toBe(23.2);
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: -23.2, status: 'PAID' }),
      })
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', version: 3 },
        data: expect.objectContaining({
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ refundAmount: 23.2 }),
        }),
      })
    );
  });

  it('replays the stored result for the same key and body without writing', async () => {
    (prisma.orderMutationIdempotency.findUnique as jest.Mock).mockResolvedValue(
      {
        requestHash: hashFor(),
        responseJson: {
          action: 'CANCEL',
          replayed: false,
          orderId: 'order-1',
          orderStatus: 'CANCELLED',
          paymentStatus: 'PENDING',
          refundAmount: 0,
          message: 'Order cancelled successfully.',
        },
      }
    );

    const result = await cancelOrderAdjustment(
      'restaurant-1',
      'order-1',
      actor,
      input
    );

    expect(result.replayed).toBe(true);
    expect(result.message).toBe('This adjustment was already recorded.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.orderModification.create).not.toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderCancelled).not.toHaveBeenCalled();
    expect(AuditLogger.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('rejects the same key with a different body', async () => {
    (prisma.orderMutationIdempotency.findUnique as jest.Mock).mockResolvedValue(
      {
        requestHash: hashFor({ reason: 'kitchen_error' }),
        responseJson: {},
      }
    );

    await expect(
      cancelOrderAdjustment('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replays a concurrent duplicate found under the transaction', async () => {
    tx.orderMutationIdempotency.findUnique.mockResolvedValue({
      requestHash: hashFor(),
      responseJson: {
        action: 'CANCEL',
        replayed: false,
        orderId: 'order-1',
        orderStatus: 'CANCELLED',
        paymentStatus: 'PENDING',
        refundAmount: 0,
        message: 'Order cancelled successfully.',
      },
    });

    const result = await cancelOrderAdjustment(
      'restaurant-1',
      'order-1',
      actor,
      input
    );

    expect(result.replayed).toBe(true);
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.orderModification.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('keeps the policy denial for a served paid order', async () => {
    currentOrder = order({
      status: 'SERVED',
      paymentStatus: 'PAID',
      payments: [
        {
          id: 'payment-1',
          paymentMethod: 'cash',
          amount: new Prisma.Decimal('23.20'),
          status: 'PAID',
        },
      ],
    });

    await expect(
      cancelOrderAdjustment('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({ code: 'ORDER_ADJUSTMENT_NOT_ALLOWED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not emit a cancellation chit for VOID and uses the status signal', async () => {
    currentOrder = order({ status: 'SERVED', paymentStatus: 'PENDING' });

    const result = await voidOrderAdjustment(
      'restaurant-1',
      'order-1',
      actor,
      input
    );

    expect(result.orderStatus).toBe('CANCELLED');
    expect(recordOrderStatusChanged).not.toHaveBeenCalled();
    expect(recordRestaurantChangeTx).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: 'order.voided' }),
      })
    );
    expect(PostgresEventManager.publishOrderStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        oldStatus: 'SERVED',
        newStatus: 'CANCELLED',
      })
    );
    expect(PostgresEventManager.publishOrderCancelled).not.toHaveBeenCalled();
    expect(AuditLogger.logSecurityEvent).toHaveBeenCalledWith(
      'user-1',
      'ORDER_VOIDED',
      'high',
      'VOID for order order-1',
      expect.any(Object)
    );
  });

  it('does not emit a cancellation chit for REFUND', async () => {
    currentOrder = order({
      status: 'SERVED',
      paymentStatus: 'PAID',
      payments: [
        {
          id: 'payment-1',
          paymentMethod: 'cash',
          amount: new Prisma.Decimal('23.20'),
          status: 'PAID',
        },
      ],
    });

    const result = await refundOrderAdjustment(
      'restaurant-1',
      'order-1',
      actor,
      input
    );

    expect(result.orderStatus).toBe('SERVED');
    expect(recordOrderStatusChanged).not.toHaveBeenCalled();
    expect(recordRestaurantChangeTx).toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderCancelled).not.toHaveBeenCalled();
    expect(
      PostgresEventManager.publishOrderStatusChange
    ).not.toHaveBeenCalled();
    expect(AuditLogger.logSecurityEvent).toHaveBeenCalledWith(
      'user-1',
      'ORDER_REFUNDED',
      'high',
      'Refund for order order-1',
      expect.any(Object)
    );
  });

  it('keeps reason notes and customer PII out of the audit row', async () => {
    await cancelOrderAdjustment('restaurant-1', 'order-1', actor, input);

    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      tableName: 'orders',
      recordId: 'order-1',
      restaurantId: 'restaurant-1',
      changedBy: 'user-1',
      changedByType: 'staff',
      category: 'orders',
      description: 'order.cancelled',
      ipAddress: '203.0.113.10',
      userAgent: 'counter-test',
    });
    expect(JSON.stringify(audit)).not.toContain('test note');
    expect(audit).not.toHaveProperty('reasonNotes');
  });
});
