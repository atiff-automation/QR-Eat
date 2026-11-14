import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { SequenceManager } from '@/lib/sequence-manager';
import { hashNoticeText } from '@/lib/loyalty/consent';
import {
  buildLoyaltyPaymentRequestHash,
  processLoyaltyOrderPayment,
  processLoyaltyTablePayment,
  type LoyaltyOrderPaymentInput,
  type LoyaltyTablePaymentInput,
} from '@/lib/services/loyalty-payment-service';
import { processTablePaymentBatch } from '@/lib/services/payment-batch-service';
import { BILL_ORDER_SELECT } from '@/lib/services/loyalty-bill-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    paymentBatch: { findUnique: jest.fn() },
    idempotencyRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
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
const sessionId = '550e8400-e29b-41d4-a716-446655440003';
const customerId = '550e8400-e29b-41d4-a716-446655440004';
const orderId = '550e8400-e29b-41d4-a716-446655440005';
const now = new Date('2026-11-13T10:00:00.000Z');

const noticeText = 'Rewards notice text';

const settingsRow = {
  enabled: true,
  visitsRequired: 3,
  rewardType: 'PERCENT',
  rewardValue: new Prisma.Decimal('10.00'),
  maxDiscount: new Prisma.Decimal('15.00'),
  minDailySpend: new Prisma.Decimal('20.00'),
  rewardLabel: '10% off, max RM15',
  noticeVersion: 'v1',
  noticeText,
  noticeTextHash: hashNoticeText(noticeText),
  privacyUrl: 'https://example.test/privacy',
  termsText: null,
};

const restaurantRow = {
  cashRounding: 'NONE',
  timezone: 'Asia/Kuala_Lumpur',
  businessDayCloseTime: '04:00',
};

const customerRow = {
  id: customerId,
  name: 'Aina',
  phone: '+60123456789',
  phoneHash: 'hash-1',
  consentAt: new Date('2026-11-01T00:00:00.000Z'),
  consentWithdrawnAt: null,
  status: 'ACTIVE',
};

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    orderNumber: 'ORD-1',
    dailySeq: 42,
    subtotalAmount: new Prisma.Decimal('60.00'),
    taxAmount: new Prisma.Decimal('3.60'),
    serviceCharge: new Prisma.Decimal('6.00'),
    discountAmount: new Prisma.Decimal('0.00'),
    totalAmount: new Prisma.Decimal('69.60'),
    taxRateSnapshot: new Prisma.Decimal('0.06'),
    serviceChargeRateSnapshot: new Prisma.Decimal('0.10'),
    paymentStatus: 'PENDING',
    status: 'CONFIRMED',
    orderType: 'DINE_IN',
    offlineCreated: false,
    offlineCreatedAt: null,
    discountVersion: 7,
    customerId: null,
    diningSessionId: sessionId,
    tableId,
    createdAt: now,
    restaurant: {
      id: restaurantId,
      name: 'Test Restaurant',
      taxLabel: 'Tax',
      serviceChargeLabel: 'Service Charge',
      address: null,
      phone: null,
      email: null,
    },
    items: [
      {
        menuItemId: 'item-1',
        totalAmount: new Prisma.Decimal('60.00'),
        menuItem: { name: 'Pasta', categoryId: 'cat-1' },
      },
    ],
    ...overrides,
  };
}

const tx = {
  $queryRaw: jest.fn(),
  restaurant: { findUnique: jest.fn() },
  diningSession: { findFirst: jest.fn(), update: jest.fn() },
  order: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  orderDiscount: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  loyaltySettings: { findUnique: jest.fn() },
  promotion: { findMany: jest.fn() },
  customer: { findFirst: jest.fn() },
  loyaltyCard: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  loyaltyVisit: { findFirst: jest.fn(), create: jest.fn() },
  paymentBatch: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  payment: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  idempotencyRecord: { update: jest.fn(), updateMany: jest.fn() },
};

function resetTx(): void {
  for (const group of Object.values(tx)) {
    if (typeof group === 'function') continue;
    for (const mock of Object.values(group)) {
      (mock as jest.Mock).mockReset();
    }
  }
  tx.$queryRaw.mockReset();

  tx.$queryRaw.mockResolvedValue([{ lock: '1' }]);
  tx.restaurant.findUnique.mockResolvedValue(restaurantRow);
  tx.diningSession.findFirst.mockResolvedValue({
    id: sessionId,
    billRevision: 7,
    customerId,
  });
  tx.diningSession.update.mockResolvedValue({});
  tx.order.findMany.mockResolvedValue([orderRow()]);
  tx.order.findFirst.mockResolvedValue(orderRow());
  tx.order.count.mockResolvedValue(0);
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  tx.orderDiscount.findMany.mockResolvedValue([]);
  tx.orderDiscount.updateMany.mockResolvedValue({ count: 0 });
  tx.orderDiscount.create.mockResolvedValue({});
  tx.loyaltySettings.findUnique.mockResolvedValue(settingsRow);
  tx.promotion.findMany.mockResolvedValue([]);
  tx.customer.findFirst.mockResolvedValue(customerRow);
  tx.loyaltyCard.findUnique.mockResolvedValue(null);
  tx.loyaltyCard.create.mockResolvedValue({});
  tx.loyaltyCard.update.mockResolvedValue({});
  tx.loyaltyVisit.findFirst.mockResolvedValue(null);
  tx.loyaltyVisit.create.mockResolvedValue({ id: 'visit-1' });
  tx.paymentBatch.findUnique.mockResolvedValue(null);
  tx.paymentBatch.findMany.mockResolvedValue([]);
  tx.paymentBatch.create.mockResolvedValue({});
  tx.paymentBatch.update.mockResolvedValue({});
  tx.payment.create.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) => ({
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
    })
  );
  tx.auditLog.create.mockResolvedValue({});
  tx.idempotencyRecord.update.mockResolvedValue({});
  tx.idempotencyRecord.updateMany.mockResolvedValue({ count: 1 });
}

function tableInput(
  overrides: Partial<LoyaltyTablePaymentInput> = {}
): LoyaltyTablePaymentInput {
  return {
    tableId,
    restaurantId,
    userId: 'user-1',
    userType: 'staff',
    idempotencyKey: 'payment-key-12345678',
    paymentMethod: 'cash',
    cashReceived: '100.00',
    expectedTotal: '69.60',
    expectedCashPayable: '69.60',
    expectedBillRevision: 7,
    now,
    ...overrides,
  };
}

function orderInput(
  overrides: Partial<LoyaltyOrderPaymentInput> = {}
): LoyaltyOrderPaymentInput {
  return {
    orderId,
    restaurantId,
    userId: 'user-1',
    userType: 'staff',
    idempotencyKey: 'order-payment-key-12345678',
    paymentMethod: 'card',
    expectedTotal: '69.60',
    expectedBillRevision: 7,
    now,
    ...overrides,
  };
}

function callOrder(...mocks: jest.Mock[]): number[] {
  return mocks.map((mock) => mock.mock.invocationCallOrder[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.LOYALTY_ENABLED = 'true';
  resetTx();

  (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.idempotencyRecord.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.idempotencyRecord.create as jest.Mock).mockResolvedValue({});
  (prisma.idempotencyRecord.deleteMany as jest.Mock).mockResolvedValue({
    count: 0,
  });
  (prisma.idempotencyRecord.delete as jest.Mock).mockResolvedValue({});
  (SequenceManager.getNextReceipt as jest.Mock).mockResolvedValue({
    number: 42,
    formatted: 'RCP-1',
  });
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (client: typeof tx) => unknown) => callback(tx)
  );
});

afterAll(() => {
  delete process.env.LOYALTY_ENABLED;
});

describe('loyalty table payment — transaction', () => {
  it('writes batch, visit, card, payments and the idempotency record in order', async () => {
    const result = await processLoyaltyTablePayment(tableInput());

    expect(result.replayed).toBe(false);
    expect(result.response).toMatchObject({
      outcome: 'VISIT_COUNTED',
      completedVisits: 1,
      visitsRequired: 3,
      totalPaid: '69.60',
      cashPayable: '69.60',
      billRevision: 7,
    });

    expect(tx.paymentBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId,
          tableId,
          totalAmount: expect.anything(),
          businessDate: new Date('2026-11-13T00:00:00.000Z'),
          cashPayable: expect.anything(),
          roundingAdjustment: expect.anything(),
          outcome: 'VISIT_COUNTED',
        }),
      })
    );
    expect(tx.loyaltyVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId,
          diningSessionId: sessionId,
          paymentBatchId: expect.any(String),
        }),
      })
    );
    expect(tx.loyaltyCard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId,
          visitsInCycle: 1,
          cycleNumber: 1,
        }),
      })
    );
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.idempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      })
    );

    const order = callOrder(
      tx.paymentBatch.create,
      tx.loyaltyVisit.create,
      tx.loyaltyCard.create,
      tx.payment.create,
      tx.idempotencyRecord.update
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('returns a payment object that is a superset of the legacy shape (F-03)', async () => {
    const result = await processLoyaltyTablePayment(
      tableInput({ externalTransactionId: 'ext-1' })
    );

    const payment = result.response.payment as Record<string, unknown>;
    for (const key of [
      'id',
      'orderId',
      'amount',
      'receiptNumber',
      'status',
      'paymentMethod',
      'batchId',
      'netAmount',
      'processingFee',
      'dailySeq',
      'externalTransactionId',
      'paymentMetadata',
      'processedAt',
      'completedAt',
    ]) {
      expect(payment).toHaveProperty(key);
    }

    expect(payment.status).toBe('PAID');
    expect(payment.paymentMethod).toBe('cash');
    expect(payment.batchId).toEqual(expect.any(String));
    expect(payment.externalTransactionId).toBe('ext-1');
  });

  it('returns payment.order.items with the legacy item shape (F-1)', async () => {
    const legacyItem = {
      id: 'line-1',
      orderId,
      menuItemId: 'item-1',
      clientItemId: null,
      quantity: 2,
      unitPrice: new Prisma.Decimal('30.00'),
      totalAmount: new Prisma.Decimal('60.00'),
      specialInstructions: 'No cheese',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      menuItem: {
        name: 'Pasta',
        price: new Prisma.Decimal('30.00'),
        preparationTime: 12,
        categoryId: 'cat-1',
      },
      selectedOptions: [
        {
          id: 'opt-1',
          name: 'Extra cheese',
          priceModifier: new Prisma.Decimal('2.00'),
        },
      ],
    };
    tx.order.findMany.mockResolvedValue([orderRow({ items: [legacyItem] })]);

    const result = await processLoyaltyTablePayment(tableInput());

    const items = (
      result.response.payment as {
        order: { items: Array<Record<string, unknown>> };
      }
    ).order.items;

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: 'line-1',
        orderId,
        menuItemId: 'item-1',
        quantity: 2,
        unitPrice: expect.anything(),
        totalAmount: expect.anything(),
        specialInstructions: 'No cheese',
        selectedOptions: [
          expect.objectContaining({
            id: 'opt-1',
            name: 'Extra cheese',
            priceModifier: expect.anything(),
          }),
        ],
        menuItem: expect.objectContaining({
          name: 'Pasta',
          price: expect.anything(),
          preparationTime: 12,
          categoryId: 'cat-1',
        }),
      })
    );

    // The payment read selects the legacy item projection...
    const select = (tx.order.findMany as jest.Mock).mock.calls[0][0].select;
    expect(select.items.include.menuItem.select).toEqual(
      expect.objectContaining({
        price: true,
        preparationTime: true,
        categoryId: true,
      })
    );
    expect(select.items.include.selectedOptions).toBeDefined();

    // ...without widening the lighter bill read.
    expect(BILL_ORDER_SELECT.items.select).not.toHaveProperty('quantity');
  });

  it('creates the PAYMENT idempotency record before the payment transaction', async () => {
    await processLoyaltyTablePayment(tableInput());

    const createRecord = (prisma.idempotencyRecord.create as jest.Mock).mock
      .invocationCallOrder[0];
    const transaction = (prisma.$transaction as jest.Mock).mock
      .invocationCallOrder[0];
    expect(createRecord).toBeLessThan(transaction);
    expect(prisma.idempotencyRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'PAYMENT',
          status: 'IN_PROGRESS',
        }),
      })
    );
  });

  it('takes the customer/day lock before the bill lock (R-06)', async () => {
    await processLoyaltyTablePayment(tableInput());

    const lockKeys = tx.$queryRaw.mock.calls.map((call) => call[1]);
    expect(lockKeys).toHaveLength(2);
    expect(lockKeys[0]).toContain(`loyalty-day:${restaurantId}:${customerId}:`);
    expect(lockKeys[1]).toBe(`loyalty-bill:${restaurantId}:${sessionId}`);
  });

  it('rejects an already-paid bill instead of treating 0.00 as due (R-08)', async () => {
    tx.order.findMany.mockResolvedValue([orderRow({ paymentStatus: 'PAID' })]);

    await expect(
      processLoyaltyTablePayment(tableInput())
    ).rejects.toMatchObject({ code: 'BILL_PAID' });

    expect(tx.paymentBatch.create).not.toHaveBeenCalled();
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('does not write a visit or card when a promotion applies', async () => {
    tx.orderDiscount.findMany.mockResolvedValue([
      {
        id: 'discount-1',
        orderId,
        source: 'PROMOTION',
        sourceId: 'promo-1',
        label: 'Lunch 20%',
        baseAmount: new Prisma.Decimal('60.00'),
        amount: new Prisma.Decimal('12.00'),
        promotionSnapshot: {
          name: 'Lunch 20%',
          scope: 'ITEM',
          receiptLabel: 'Lunch 20%',
        },
      },
    ]);

    const result = await processLoyaltyTablePayment(
      tableInput({
        expectedTotal: '55.68',
        expectedCashPayable: '55.68',
        cashReceived: '60.00',
      })
    );

    expect(result.response).toMatchObject({
      outcome: 'PROMOTION_APPLIED',
      discountAmount: '12.00',
    });
    expect(tx.promotion.findMany).not.toHaveBeenCalled();
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.loyaltyCard.create).not.toHaveBeenCalled();
    expect(tx.loyaltyCard.update).not.toHaveBeenCalled();
    // Order create owns the promotion row; payment never rewrites it.
    expect(tx.orderDiscount.create).not.toHaveBeenCalled();
    expect(tx.orderDiscount.updateMany).not.toHaveBeenCalled();
  });

  it('keeps an order-time promotion when its window has expired at payment', async () => {
    // The QR order locked the promotion and stored the discounted total. At
    // payment time the promotion has ended; the ACTIVE ledger row still wins and
    // the amount must never rise above the QR confirmation.
    tx.promotion.findMany.mockResolvedValue([]);
    tx.orderDiscount.findMany.mockResolvedValue([
      {
        id: 'discount-1',
        orderId,
        source: 'PROMOTION',
        sourceId: 'promo-1',
        label: 'Lunch 20%',
        baseAmount: new Prisma.Decimal('60.00'),
        amount: new Prisma.Decimal('12.00'),
        promotionSnapshot: {
          name: 'Lunch 20%',
          scope: 'ITEM',
          receiptLabel: 'Lunch 20%',
        },
      },
    ]);

    const result = await processLoyaltyTablePayment(
      tableInput({
        expectedTotal: '55.68',
        expectedCashPayable: '55.68',
        cashReceived: '60.00',
      })
    );

    expect(result.response).toMatchObject({
      outcome: 'PROMOTION_APPLIED',
      discountAmount: '12.00',
      totalPaid: '55.68',
    });
    expect(tx.promotion.findMany).not.toHaveBeenCalled();
    expect(tx.orderDiscount.create).not.toHaveBeenCalled();
    expect(tx.orderDiscount.updateMany).not.toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discountAmount: expect.anything(),
          discountSource: 'PROMOTION',
        }),
      })
    );
  });

  it('applies the reward and resets the card on the completing visit', async () => {
    tx.loyaltyCard.findUnique.mockResolvedValue({
      visitsInCycle: 2,
      cycleNumber: 1,
      ...settingsRow,
    });

    const result = await processLoyaltyTablePayment(
      tableInput({
        expectedTotal: '62.64',
        expectedCashPayable: '62.64',
        cashReceived: '70.00',
      })
    );

    expect(result.response).toMatchObject({
      outcome: 'REWARD_APPLIED',
      completedVisits: 3,
      cardReset: true,
      rewardApplied: true,
      discountAmount: '6.00',
    });
    expect(tx.loyaltyCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visitsInCycle: 0,
          cycleNumber: { increment: 1 },
        }),
      })
    );
    expect(tx.orderDiscount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'LOYALTY_REWARD',
          sourceId: 'visit-1',
          amount: expect.anything(),
        }),
      })
    );
  });

  it('resets the card even when the completing visit earns a zero reward', async () => {
    tx.loyaltyCard.findUnique.mockResolvedValue({
      visitsInCycle: 2,
      cycleNumber: 1,
      ...settingsRow,
      rewardValue: new Prisma.Decimal('0.00'),
      maxDiscount: new Prisma.Decimal('0.00'),
    });

    const result = await processLoyaltyTablePayment(tableInput());

    expect(result.response).toMatchObject({
      outcome: 'VISIT_COUNTED',
      cardReset: true,
      rewardApplied: false,
    });
    expect(tx.loyaltyCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visitsInCycle: 0 }),
      })
    );
    expect(tx.orderDiscount.create).not.toHaveBeenCalled();
  });

  it('replays an existing batch without re-applying a visit or reward', async () => {
    (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue({
      id: 'batch-1',
      idempotencyKey: 'payment-key-12345678',
      requestHash: buildLoyaltyPaymentRequestHash(tableInput()),
      restaurantId,
      tableId,
      orderId: null,
      response: { success: true, outcome: 'VISIT_COUNTED' },
    });

    const result = await processLoyaltyTablePayment(tableInput());

    expect(result.replayed).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.loyaltyCard.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('returns PAYMENT_IN_PROGRESS for a duplicate key with no batch', async () => {
    (prisma.idempotencyRecord.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['restaurantId', 'scope', 'key'] },
      })
    );

    await expect(
      processLoyaltyTablePayment(tableInput())
    ).rejects.toMatchObject({ code: 'PAYMENT_IN_PROGRESS' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // The record belongs to the concurrent request; never delete it.
    expect(prisma.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('does not clear this request record on IDEMPOTENCY_MISMATCH', async () => {
    // A concurrent batch with the same key but a different hash appears under
    // the lock. The IN_PROGRESS record this request created must survive.
    tx.paymentBatch.findUnique.mockResolvedValue({
      requestHash: 'different-hash',
      restaurantId,
      tableId,
      orderId: null,
    });

    await expect(
      processLoyaltyTablePayment(tableInput())
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
    expect(prisma.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('returns receipt items only for the orders paid in this request', async () => {
    const paidOrder = orderRow({
      id: 'paid-order',
      paymentStatus: 'PAID',
      items: [
        {
          menuItemId: 'old-item',
          totalAmount: new Prisma.Decimal('60.00'),
          menuItem: { name: 'Old dish', categoryId: 'cat-1' },
        },
      ],
    });
    const pendingOrder = orderRow();
    tx.order.findMany.mockResolvedValue([paidOrder, pendingOrder]);

    const result = await processLoyaltyTablePayment(tableInput());

    const items = (
      result.response.payment as {
        order: { items: Array<{ menuItemId: string }> };
      }
    ).order.items;
    expect(items.map((item) => item.menuItemId)).toEqual(['item-1']);
  });

  it('labels a multi-promotion session as Promotions', async () => {
    const secondOrderId = '550e8400-e29b-41d4-a716-446655440006';
    tx.order.findMany.mockResolvedValue([
      orderRow(),
      orderRow({
        id: secondOrderId,
        items: [
          {
            menuItemId: 'item-2',
            totalAmount: new Prisma.Decimal('60.00'),
            menuItem: { name: 'Drink', categoryId: 'cat-2' },
          },
        ],
      }),
    ]);
    tx.orderDiscount.findMany.mockResolvedValue([
      {
        id: 'discount-1',
        orderId,
        source: 'PROMOTION',
        sourceId: 'promo-1',
        label: 'Lunch 20%',
        baseAmount: new Prisma.Decimal('60.00'),
        amount: new Prisma.Decimal('12.00'),
        promotionSnapshot: {
          name: 'Lunch 20%',
          scope: 'ITEM',
          receiptLabel: 'Lunch 20%',
        },
      },
      {
        id: 'discount-2',
        orderId: secondOrderId,
        source: 'PROMOTION',
        sourceId: 'promo-2',
        label: 'Drink 20%',
        baseAmount: new Prisma.Decimal('60.00'),
        amount: new Prisma.Decimal('12.00'),
        promotionSnapshot: {
          name: 'Drink 20%',
          scope: 'ITEM',
          receiptLabel: 'Drink 20%',
        },
      },
    ]);

    const result = await processLoyaltyTablePayment(
      tableInput({
        paymentMethod: 'card',
        cashReceived: undefined,
        expectedCashPayable: undefined,
        expectedTotal: '111.36',
      })
    );

    expect(result.response).toMatchObject({
      outcome: 'PROMOTION_APPLIED',
      discountAmount: '24.00',
    });
    expect(tx.diningSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discountSource: 'PROMOTION',
          discountLabel: 'Promotions',
        }),
      })
    );
  });

  it('returns BILL_CHANGED before any write for a stale revision', async () => {
    await expect(
      processLoyaltyTablePayment(tableInput({ expectedBillRevision: 6 }))
    ).rejects.toMatchObject({ code: 'BILL_CHANGED' });

    expect(tx.paymentBatch.create).not.toHaveBeenCalled();
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('returns AMOUNT_MISMATCH before any write for a stale total', async () => {
    await expect(
      processLoyaltyTablePayment(tableInput({ expectedTotal: '1.00' }))
    ).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });

    expect(tx.paymentBatch.create).not.toHaveBeenCalled();
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('returns INSUFFICIENT_CASH before any write', async () => {
    await expect(
      processLoyaltyTablePayment(tableInput({ cashReceived: '10.00' }))
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CASH' });

    expect(tx.paymentBatch.create).not.toHaveBeenCalled();
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('maps a live visit unique conflict to BILL_CHANGED with no charge', async () => {
    tx.loyaltyVisit.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['customerId', 'businessDate'] },
      })
    );

    await expect(
      processLoyaltyTablePayment(tableInput())
    ).rejects.toMatchObject({ code: 'BILL_CHANGED' });

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(prisma.idempotencyRecord.deleteMany).toHaveBeenCalled();
  });

  it('keeps an offline-created order at full price with no benefit', async () => {
    tx.diningSession.findFirst.mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId: null,
    });
    tx.order.findMany.mockResolvedValue([
      orderRow({ offlineCreated: true, offlineCreatedAt: now }),
    ]);

    const result = await processLoyaltyTablePayment(
      tableInput({ recordedOffline: true })
    );

    expect(result.response).toMatchObject({
      outcome: 'GUEST',
      recordedOffline: true,
    });
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.loyaltyCard.create).not.toHaveBeenCalled();
    expect(tx.orderDiscount.create).not.toHaveBeenCalled();
    expect(tx.orderDiscount.updateMany).not.toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: 'PAID' } })
    );
  });

  it('reports NO_BENEFIT for a member bill replayed offline (F-01)', async () => {
    tx.order.findMany.mockResolvedValue([
      orderRow({ offlineCreated: true, offlineCreatedAt: now }),
    ]);

    const result = await processLoyaltyTablePayment(
      tableInput({ recordedOffline: true })
    );

    expect(result.response).toMatchObject({
      outcome: 'NO_BENEFIT',
      recordedOffline: true,
    });
  });

  it('reports GUEST when the bill member has withdrawn consent (F-6)', async () => {
    tx.customer.findFirst.mockResolvedValue({
      ...customerRow,
      consentWithdrawnAt: new Date('2026-11-10T00:00:00.000Z'),
    });
    tx.order.findMany.mockResolvedValue([
      orderRow({ offlineCreated: true, offlineCreatedAt: now }),
    ]);

    const result = await processLoyaltyTablePayment(
      tableInput({ recordedOffline: true })
    );

    expect(result.response).toMatchObject({
      outcome: 'GUEST',
      recordedOffline: true,
    });
    expect(tx.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      })
    );
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
  });

  it('keeps a locked promotion on an online-priced order paid offline', async () => {
    tx.order.findMany.mockResolvedValue([
      orderRow({ totalAmount: new Prisma.Decimal('55.68') }),
    ]);
    tx.orderDiscount.findMany.mockResolvedValue([
      {
        orderId,
        source: 'PROMOTION',
        amount: new Prisma.Decimal('12.00'),
      },
    ]);

    const result = await processLoyaltyTablePayment(
      tableInput({
        recordedOffline: true,
        expectedTotal: '55.68',
        expectedCashPayable: '55.68',
        cashReceived: '60.00',
      })
    );

    expect(result.response).toMatchObject({
      outcome: 'PROMOTION_APPLIED',
      discountAmount: '12.00',
      offlineBusinessDateFallback: true,
    });
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.loyaltyCard.create).not.toHaveBeenCalled();
    expect(tx.orderDiscount.create).not.toHaveBeenCalled();
    expect(tx.orderDiscount.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an offline replay that carries a projected reward', async () => {
    tx.order.findMany.mockResolvedValue([
      orderRow({ totalAmount: new Prisma.Decimal('55.68') }),
    ]);
    tx.orderDiscount.findMany.mockResolvedValue([
      {
        orderId,
        source: 'PROMOTION',
        amount: new Prisma.Decimal('12.00'),
      },
    ]);

    await expect(
      processLoyaltyTablePayment(
        tableInput({
          recordedOffline: true,
          expectedTotal: '49.68',
          expectedCashPayable: '49.68',
        })
      )
    ).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });

    expect(tx.paymentBatch.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('charges card exactly and stores no cash fields on the batch', async () => {
    const result = await processLoyaltyTablePayment(
      tableInput({
        paymentMethod: 'card',
        cashReceived: undefined,
        expectedCashPayable: undefined,
      })
    );

    // Card/e-wallet charge `projectedTotal`; `cashPayable` is cash-only.
    expect(result.response.cashPayable).toBeNull();
    expect(tx.paymentBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: 'card',
          cashPayable: null,
          roundingAdjustment: null,
          cashReceived: null,
          changeGiven: null,
        }),
      })
    );
  });
});

describe('loyalty takeaway payment — transaction', () => {
  it('pays one takeaway order with a visit and the order bill revision', async () => {
    const takeaway = orderRow({
      orderType: 'TAKEAWAY',
      tableId: null,
      diningSessionId: null,
      customerId,
      customerName: 'Aina',
      customerPhone: '+60123456789',
    });
    tx.order.findFirst.mockResolvedValue(takeaway);

    const result = await processLoyaltyOrderPayment(orderInput());

    expect(result.response).toMatchObject({
      outcome: 'VISIT_COUNTED',
      totalPaid: '69.60',
    });
    const liveOrder = (
      result.response as {
        payment: { order: Record<string, unknown> };
      }
    ).payment.order;
    expect(liveOrder).toMatchObject({
      customerName: 'Aina',
      customerPhone: '+60123456789',
    });

    const storedCall = tx.paymentBatch.update.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg?.data?.response);
    expect(storedCall).toBeDefined();
    const storedOrder = (
      storedCall!.data.response as {
        payment: { order: Record<string, unknown> };
      }
    ).payment.order;
    expect(storedOrder).not.toHaveProperty('customerName');
    expect(storedOrder).not.toHaveProperty('customerPhone');
    expect(storedOrder).not.toHaveProperty('customerEmail');

    const idempotencyCall = tx.idempotencyRecord.update.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg?.data?.responseJson);
    expect(idempotencyCall).toBeDefined();
    const storedIdempotencyOrder = (
      idempotencyCall!.data.responseJson as {
        payment: { order: Record<string, unknown> };
      }
    ).payment.order;
    expect(storedIdempotencyOrder).not.toHaveProperty('customerName');
    expect(storedIdempotencyOrder).not.toHaveProperty('customerPhone');
    expect(storedIdempotencyOrder).not.toHaveProperty('customerEmail');
    expect(tx.paymentBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId,
          tableId: null,
        }),
      })
    );
    expect(tx.loyaltyVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId,
          diningSessionId: null,
        }),
      })
    );
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
  });
});

describe('legacy payment — loyalty flag off', () => {
  it('writes businessDate and a GUEST outcome for a paid batch', async () => {
    process.env.LOYALTY_ENABLED = 'false';

    await processTablePaymentBatch({
      tableId,
      restaurantId,
      userId: 'user-1',
      userType: 'staff',
      idempotencyKey: 'payment-key-12345678',
      paymentMethod: 'card',
    });

    expect(tx.paymentBatch.create).toHaveBeenCalledTimes(1);
    const data = (tx.paymentBatch.create as jest.Mock).mock.calls[0][0].data;
    expect(data.businessDate).toBeInstanceOf(Date);
    expect(data.businessDate).not.toBeNull();
    expect(data.outcome).toBe('GUEST');
    // The legacy path never touches the loyalty tables.
    expect(tx.loyaltySettings.findUnique).not.toHaveBeenCalled();
    expect(tx.promotion.findMany).not.toHaveBeenCalled();
    expect(tx.orderDiscount.findMany).not.toHaveBeenCalled();
  });
});
