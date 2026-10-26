/**
 * PAY-01 regression tests: payment idempotency replay and key validation.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { SequenceManager } from '@/lib/sequence-manager';
import {
  buildOrderPaymentRequestHash,
  buildPaymentRequestHash,
  processOrderPaymentBatch,
  processTablePaymentBatch,
  type ProcessOrderPaymentInput,
  type ProcessTablePaymentInput,
} from '@/lib/services/payment-batch-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    paymentBatch: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/sequence-manager', () => ({
  SequenceManager: {
    getNextReceipt: jest.fn(),
  },
}));

const baseInput: ProcessTablePaymentInput = {
  tableId: '550e8400-e29b-41d4-a716-446655440000',
  restaurantId: '550e8400-e29b-41d4-a716-446655440001',
  userId: 'user-1',
  userType: 'staff',
  idempotencyKey: 'payment-key-12345678',
  paymentMethod: 'cash',
  cashReceived: 50,
};

describe('payment idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires an idempotency key', async () => {
    await expect(
      processTablePaymentBatch({ ...baseInput, idempotencyKey: '' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('replays the stored response for the same key and request', async () => {
    const requestHash = buildPaymentRequestHash(baseInput);
    (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue({
      id: 'batch-1',
      idempotencyKey: baseInput.idempotencyKey,
      requestHash,
      restaurantId: baseInput.restaurantId,
      tableId: baseInput.tableId,
      response: { success: true, receiptNumber: 'RCP-1' },
    });

    const result = await processTablePaymentBatch(baseInput);

    expect(result.replayed).toBe(true);
    expect(result.response).toMatchObject({
      success: true,
      receiptNumber: 'RCP-1',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects the same key with a different request', async () => {
    (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue({
      id: 'batch-1',
      idempotencyKey: baseInput.idempotencyKey,
      requestHash: 'different-hash',
      restaurantId: baseInput.restaurantId,
      tableId: baseInput.tableId,
      response: { success: true },
    });

    await expect(processTablePaymentBatch(baseInput)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_MISMATCH',
      statusCode: 409,
    });
  });
});

const orderInput: ProcessOrderPaymentInput = {
  orderId: '550e8400-e29b-41d4-a716-446655440010',
  restaurantId: '550e8400-e29b-41d4-a716-446655440001',
  userId: 'user-1',
  userType: 'staff',
  idempotencyKey: 'order-payment-key-12345678',
  paymentMethod: 'cash',
  cashReceived: 20,
};

const takeawayOrder = {
  id: orderInput.orderId,
  restaurantId: orderInput.restaurantId,
  orderNumber: 'ORD-TAKEAWAY-1',
  dailySeq: 42,
  orderType: 'TAKEAWAY',
  tableId: null,
  status: 'CONFIRMED',
  paymentStatus: 'PENDING',
  totalAmount: new Prisma.Decimal('10.60'),
  subtotalAmount: new Prisma.Decimal('10.00'),
  taxAmount: new Prisma.Decimal('0.60'),
  serviceCharge: new Prisma.Decimal('0'),
  customerName: 'Alex',
  customerPhone: null,
  createdAt: new Date(),
  table: null,
  restaurant: {
    id: orderInput.restaurantId,
    name: 'Test Restaurant',
    taxLabel: 'Tax',
    serviceChargeLabel: 'Service Charge',
    address: '1 Test Street',
    phone: null,
    email: null,
  },
  items: [],
};

describe('order payment idempotency', () => {
  const tx = {
    $queryRaw: jest.fn(),
    paymentBatch: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    payment: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (SequenceManager.getNextReceipt as jest.Mock).mockResolvedValue({
      number: 42,
      formatted: 'RCP-ORDER-1',
    });
    (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([{ lock: '1' }]);
    tx.paymentBatch.findUnique.mockResolvedValue(null);
    tx.paymentBatch.create.mockResolvedValue({});
    tx.paymentBatch.update.mockResolvedValue({});
    tx.order.findUnique.mockResolvedValue(takeawayOrder);
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.payment.create.mockResolvedValue({
      id: 'payment-1',
      orderId: orderInput.orderId,
      amount: new Prisma.Decimal('10.60'),
      receiptNumber: 'RCP-ORDER-1',
    });
    tx.auditLog.create.mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
  });

  it('requires an idempotency key', async () => {
    await expect(
      processOrderPaymentBatch({ ...orderInput, idempotencyKey: '' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('replays the stored order payment response', async () => {
    const requestHash = buildOrderPaymentRequestHash(orderInput);
    (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue({
      id: 'batch-order-1',
      idempotencyKey: orderInput.idempotencyKey,
      requestHash,
      restaurantId: orderInput.restaurantId,
      tableId: null,
      orderId: orderInput.orderId,
      response: { success: true, receiptNumber: 'RCP-ORDER-1' },
    });

    const result = await processOrderPaymentBatch(orderInput);

    expect(result.replayed).toBe(true);
    expect(result.response).toMatchObject({
      success: true,
      receiptNumber: 'RCP-ORDER-1',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects the same key for another order', async () => {
    (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue({
      id: 'batch-order-1',
      idempotencyKey: orderInput.idempotencyKey,
      requestHash: buildOrderPaymentRequestHash(orderInput),
      restaurantId: orderInput.restaurantId,
      tableId: null,
      orderId: 'another-order',
      response: { success: true },
    });

    await expect(processOrderPaymentBatch(orderInput)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_MISMATCH',
      statusCode: 409,
    });
  });

  it('pays one takeaway order without a table target', async () => {
    const result = await processOrderPaymentBatch(orderInput);

    expect(result.replayed).toBe(false);
    expect(result.response).toMatchObject({
      success: true,
      receiptNumber: 'RCP-ORDER-1',
      totalPaid: '10.6',
    });
    expect(tx.paymentBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tableId: null,
          orderId: orderInput.orderId,
          totalAmount: new Prisma.Decimal('10.60'),
        }),
      })
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: orderInput.orderId,
          orderType: 'TAKEAWAY',
          tableId: null,
          paymentStatus: 'PENDING',
        }),
        data: { paymentStatus: 'PAID' },
      })
    );
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: orderInput.orderId,
          batchId: expect.any(String),
          receiptNumber: 'RCP-ORDER-1',
        }),
      })
    );
  });
});
