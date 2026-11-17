/**
 * Legacy (loyalty-off) payment rounding (REVIEW-29 B-PAY-1).
 *
 * Cash rounding is independent of loyalty: the legacy path must read
 * `Restaurant.cashRounding`, charge `cashPayable`, record the adjustment and
 * reconcile the drawer. Card and e-wallet stay exact with no cash fields.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { SequenceManager } from '@/lib/sequence-manager';
import {
  processOrderPaymentBatch,
  processTablePaymentBatch,
} from '@/lib/services/payment-batch-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    paymentBatch: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/sequence-manager', () => ({
  SequenceManager: { getNextReceipt: jest.fn() },
}));

jest.mock('@/lib/restaurant-changes', () => ({
  recordRestaurantChange: jest.fn(),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const orderId = '550e8400-e29b-41d4-a716-446655440005';

const restaurant = (cashRounding: 'NONE' | 'NEAREST_5_SEN') => ({
  id: restaurantId,
  name: 'Test Restaurant',
  taxLabel: 'Tax',
  serviceChargeLabel: 'Service Charge',
  address: null,
  phone: null,
  email: null,
  timezone: 'Asia/Kuala_Lumpur',
  businessDayCloseTime: '04:00',
  cashRounding,
});

function tableOrder(cashRounding: 'NONE' | 'NEAREST_5_SEN') {
  return {
    id: orderId,
    restaurantId,
    orderNumber: 'ORD-1',
    dailySeq: 1,
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    subtotalAmount: new Prisma.Decimal('10.00'),
    taxAmount: new Prisma.Decimal('0.63'),
    serviceCharge: new Prisma.Decimal('0.00'),
    totalAmount: new Prisma.Decimal('10.63'),
    createdAt: new Date('2026-11-16T02:00:00.000Z'),
    table: { tableNumber: 1, tableName: 'T1', locationDescription: null },
    restaurant: restaurant(cashRounding),
    items: [],
  };
}

const takeawayOrder = (cashRounding: 'NONE' | 'NEAREST_5_SEN') => ({
  ...tableOrder(cashRounding),
  orderType: 'TAKEAWAY',
  tableId: null,
  table: null,
});

const tx = {
  $queryRaw: jest.fn(),
  paymentBatch: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  order: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  payment: { create: jest.fn() },
  auditLog: { create: jest.fn() },
};

function resetTx(): void {
  tx.$queryRaw.mockReset().mockResolvedValue([{ lock: '1' }]);
  tx.paymentBatch.findUnique.mockReset().mockResolvedValue(null);
  tx.paymentBatch.create.mockReset().mockResolvedValue({});
  tx.paymentBatch.update.mockReset().mockResolvedValue({});
  tx.order.findUnique.mockReset().mockResolvedValue(null);
  tx.order.findMany.mockReset().mockResolvedValue([]);
  tx.order.count.mockReset().mockResolvedValue(0);
  tx.order.updateMany.mockReset().mockResolvedValue({ count: 1 });
  tx.payment.create
    .mockReset()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: `pay-${data.orderId}`,
      orderId: data.orderId,
      amount: data.amount,
      receiptNumber: data.receiptNumber,
      status: data.status,
      paymentMethod: data.paymentMethod,
      batchId: data.batchId,
      netAmount: data.netAmount,
      processingFee: data.processingFee,
      dailySeq: data.dailySeq,
      externalTransactionId: data.externalTransactionId,
      paymentMetadata: data.paymentMetadata,
      processedAt: data.processedAt,
      completedAt: data.completedAt,
    }));
  tx.auditLog.create.mockReset().mockResolvedValue({});
}

function createdBatchData(): Record<string, unknown> {
  const call = tx.paymentBatch.create.mock.calls[0]?.[0] as
    | { data: Record<string, unknown> }
    | undefined;
  if (!call) throw new Error('paymentBatch.create was not called');
  return call.data;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.LOYALTY_ENABLED;
  resetTx();
  (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue(null);
  (SequenceManager.getNextReceipt as jest.Mock).mockResolvedValue({
    number: 1,
    formatted: 'RCP-1',
  });
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (client: typeof tx) => unknown) => callback(tx)
  );
});

afterAll(() => {
  delete process.env.LOYALTY_ENABLED;
});

describe('legacy cash rounding — table payment', () => {
  it('rounds NEAREST_5_SEN, records the adjustment and reconciles the drawer', async () => {
    tx.order.findMany.mockResolvedValue([tableOrder('NEAREST_5_SEN')]);

    const result = await processTablePaymentBatch({
      tableId,
      restaurantId,
      userId: 'user-1',
      userType: 'staff',
      idempotencyKey: 'table-rounding-key-1',
      paymentMethod: 'cash',
      cashReceived: '20.00',
    });

    const data = createdBatchData();
    expect(String(data.totalAmount)).toBe('10.63');
    expect(String(data.cashPayable)).toBe('10.65');
    expect(String(data.roundingAdjustment)).toBe('0.02');
    expect(String(data.cashReceived)).toBe('20');
    expect(String(data.changeGiven)).toBe('9.35');

    const cashReceived = data.cashReceived as Prisma.Decimal;
    const changeGiven = data.changeGiven as Prisma.Decimal;
    const cashPayable = data.cashPayable as Prisma.Decimal;
    expect(cashReceived.minus(changeGiven).eq(cashPayable)).toBe(true);
    expect(result.response.totalPaid).toBe('10.63');
    expect(result.response.changeGiven).toBe('9.35');
  });

  it('charges the exact total when cashRounding is NONE', async () => {
    tx.order.findMany.mockResolvedValue([tableOrder('NONE')]);

    await processTablePaymentBatch({
      tableId,
      restaurantId,
      userId: 'user-1',
      userType: 'staff',
      idempotencyKey: 'table-rounding-key-2',
      paymentMethod: 'cash',
      cashReceived: '20.00',
    });

    const data = createdBatchData();
    expect(String(data.cashPayable)).toBe('10.63');
    expect(String(data.roundingAdjustment)).toBe('0');
    expect(String(data.changeGiven)).toBe('9.37');
  });

  it('writes no cash fields for a card payment', async () => {
    tx.order.findMany.mockResolvedValue([tableOrder('NEAREST_5_SEN')]);

    await processTablePaymentBatch({
      tableId,
      restaurantId,
      userId: 'user-1',
      userType: 'staff',
      idempotencyKey: 'table-rounding-key-3',
      paymentMethod: 'card',
    });

    const data = createdBatchData();
    expect(data.cashPayable).toBeNull();
    expect(data.roundingAdjustment).toBeNull();
    expect(data.cashReceived).toBeNull();
    expect(data.changeGiven).toBeNull();
  });
});

describe('legacy cash rounding — takeaway order payment', () => {
  it('rounds the order total on the legacy order path', async () => {
    tx.order.findUnique.mockResolvedValue(takeawayOrder('NEAREST_5_SEN'));

    await processOrderPaymentBatch({
      orderId,
      restaurantId,
      userId: 'user-1',
      userType: 'staff',
      idempotencyKey: 'order-rounding-key-1',
      paymentMethod: 'cash',
      cashReceived: '20.00',
    });

    const data = createdBatchData();
    expect(String(data.cashPayable)).toBe('10.65');
    expect(String(data.roundingAdjustment)).toBe('0.02');
    expect(String(data.changeGiven)).toBe('9.35');
  });
});
