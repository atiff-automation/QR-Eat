/**
 * PAY-01 regression tests: payment idempotency replay and key validation.
 */

import { prisma } from '@/lib/database';
import {
  buildPaymentRequestHash,
  processTablePaymentBatch,
  type ProcessTablePaymentInput,
} from '@/lib/services/payment-batch-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    paymentBatch: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
