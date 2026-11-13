import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/database';
import { getTableCart, clearTableCart } from '@/lib/customer-session';
import { ensureOpenDiningSession } from '@/lib/dining-session';
import { SequenceManager } from '@/lib/sequence-manager';
import { isBusinessDayClosing } from '@/lib/time/business-day-guard';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { calculateOrderTotals, estimateReadyTime } from '@/lib/order-utils';
import { getQrOrderingAvailability } from '@/lib/qr-ordering-availability';
import { recordRestaurantChange } from '@/lib/restaurant-changes';
import {
  prepareLoyaltyCreate,
  startOrderCreateRecord,
  completeOrderCreateRecord,
  findOrderCreateRecord,
  newLoyaltyOrderId,
  orderCreateRequestHash,
} from '@/lib/services/loyalty-qr-service';
import { consumeQuote, getQuote } from '@/lib/services/loyalty-quote-service';
import { POST as createQrOrder } from '@/app/api/qr/orders/create/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    menuItem: { findMany: jest.fn() },
    customerSession: { update: jest.fn() },
    loyaltySettings: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/customer-session', () => ({
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

jest.mock('@/lib/qr-ordering-availability', () => ({
  getQrOrderingAvailability: jest.fn(),
}));

jest.mock('@/lib/restaurant-changes', () => ({
  recordRestaurantChange: jest.fn(),
}));

jest.mock('@/lib/services/loyalty-qr-service', () => ({
  prepareLoyaltyCreate: jest.fn(),
  startOrderCreateRecord: jest.fn(),
  completeOrderCreateRecord: jest.fn(),
  findOrderCreateRecord: jest.fn(),
  newLoyaltyOrderId: jest.fn(),
  orderCreateRequestHash: jest.fn(),
}));

jest.mock('@/lib/services/loyalty-quote-service', () => ({
  consumeQuote: jest.fn(),
  getQuote: jest.fn(),
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
    taxRate: new Prisma.Decimal('0.06'),
    serviceChargeRate: new Prisma.Decimal('0.10'),
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
      unitPrice: 60,
      subtotal: 60,
      specialInstructions: null,
      selectedOptions: [],
    },
  ],
  totalItems: 1,
  totalAmount: 60,
};

function createdOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-1',
    dailySeq: 1,
    status: 'PENDING',
    paymentStatus: 'PENDING',
    totalAmount: new Prisma.Decimal('55.68'),
    subtotalAmount: new Prisma.Decimal('60.00'),
    taxAmount: new Prisma.Decimal('2.88'),
    serviceCharge: new Prisma.Decimal('4.80'),
    taxLabelSnapshot: 'Tax',
    serviceChargeLabelSnapshot: 'Service Charge',
    taxRateSnapshot: new Prisma.Decimal('0.06'),
    serviceChargeRateSnapshot: new Prisma.Decimal('0.10'),
    estimatedReadyTime: new Date('2026-11-13T10:10:00.000Z'),
    ...overrides,
  };
}

const tx = {
  customerSession: { update: jest.fn() },
  order: { create: jest.fn() },
  orderItem: { create: jest.fn() },
  orderItemOption: { createMany: jest.fn() },
  orderDiscount: { create: jest.fn() },
  diningSession: { update: jest.fn() },
  loyaltyVisit: { create: jest.fn() },
  loyaltyCard: { update: jest.fn() },
};

const promotion = {
  id: 'promo-1',
  name: 'Lunch 20%',
  receiptLabel: 'Lunch 20%',
  type: 'PERCENT',
  value: '20.00',
  scope: 'ITEM',
  categoryIds: [],
  itemIds: ['item-1'],
  minSpend: '0.00',
  maxDiscount: '100.00',
  startsAt: new Date('2026-11-01T00:00:00.000Z'),
  endsAt: new Date('2026-12-01T00:00:00.000Z'),
  isActive: true,
};

const promotionResult = {
  applied: true,
  promotionId: 'promo-1',
  promotionName: 'Lunch 20%',
  label: 'Lunch 20%',
  scope: 'ITEM',
  eligibleBase: new Decimal('60.00'),
  discountAmount: new Decimal('12.00'),
  items: [{ itemId: 'item-1', name: 'Pasta', lineTotal: new Decimal('60.00') }],
  partialOrder: true,
};

const cartPreRewardTotals = {
  subtotal: new Decimal('60.00'),
  discountAmount: new Decimal('12.00'),
  discountedSubtotal: new Decimal('48.00'),
  taxAmount: new Decimal('2.88'),
  serviceCharge: new Decimal('4.80'),
  totalAmount: new Decimal('55.68'),
};

function computation(overrides: Record<string, unknown> = {}) {
  return {
    billRevision: 7,
    subtotal: new Decimal('60.00'),
    promotionDiscountAmount: new Decimal('12.00'),
    projectedRewardAmount: new Decimal('0.00'),
    discountAmount: new Decimal('12.00'),
    discountLines: [
      {
        source: 'PROMOTION',
        label: 'Lunch 20%',
        amount: new Decimal('12.00'),
      },
    ],
    discountedSubtotal: new Decimal('48.00'),
    taxAmount: new Decimal('2.88'),
    serviceCharge: new Decimal('4.80'),
    totalAmount: new Decimal('55.68'),
    projectedTotal: new Decimal('55.68'),
    cashPayable: new Decimal('55.70'),
    rewardLabel: '10% off, max RM15',
    rewardType: 'PERCENT',
    rewardValue: '10',
    maxDiscount: new Decimal('15.00'),
    promotionApplied: true,
    promotionScope: 'ITEM',
    promotionLabel: 'Lunch 20%',
    promotionItems: [{ itemId: 'item-1', name: 'Pasta' }],
    promotionIds: ['promo-1'],
    visitState: 'PROMOTION',
    completedVisits: 2,
    visitsRequired: 3,
    cartPromotion: { promotion, result: promotionResult },
    cartPreRewardTotals,
    cartProjectedTotals: cartPreRewardTotals,
    message: 'Lunch 20% applied to Pasta. This visit will not count.',
    ...overrides,
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    quote: {
      quoteId: 'quote-1',
      restaurantId,
      customerId: 'customer-1',
      phoneHash: 'hash-1',
      projectedTotal: new Decimal('55.68'),
      cashPayable: new Decimal('55.70'),
    },
    computation: computation(),
    customerId: 'customer-1',
    phoneHash: 'hash-1',
    guestError: null,
    expectedTotal: '55.68',
    cartHash: 'cart-hash',
    idempotencyKey: 'key-1',
    requestHash: 'request-hash',
    cartPromotion: { promotion, result: promotionResult },
    cartPreRewardTotals,
    ...overrides,
  };
}

function request(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return new NextRequest('http://localhost/api/qr/orders/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const legacyBody = { tableId };

function legacyResponseBody() {
  return {
    success: true,
    order: {
      id: 'order-1',
      orderNumber: 'ORD-1',
      dailySeq: 1,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      subtotalAmount: 10,
      taxAmount: 0.6,
      serviceCharge: 0,
      totalAmount: '10.6',
      estimatedReadyTime: '2026-11-13T10:10:00.000Z',
      sessionToken: sessionId,
      taxLabelSnapshot: 'Tax',
      serviceChargeLabelSnapshot: 'Service Charge',
      taxRateSnapshot: 0.06,
      serviceChargeRateSnapshot: 0.1,
    },
    message:
      'Order submitted successfully! Please pay at the counter when ready.',
  };
}

describe('POST /api/qr/orders/create — loyalty', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_ENABLED = 'true';
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';

    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table);
    (prisma.menuItem.findMany as jest.Mock).mockResolvedValue([
      {
        id: cart.items[0].menuItemId,
        name: 'Pasta',
        price: new Prisma.Decimal('60.00'),
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
        categoryId: 'cat-1',
      },
    ]);
    (prisma.customerSession.update as jest.Mock).mockResolvedValue({});
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      enabled: true,
    });
    (getTableCart as jest.Mock).mockResolvedValue(cart);
    (clearTableCart as jest.Mock).mockResolvedValue(undefined);
    (ensureOpenDiningSession as jest.Mock).mockResolvedValue({
      id: diningSessionId,
      billRevision: 0,
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
      new Date('2026-11-13T10:10:00.000Z')
    );
    (getQrOrderingAvailability as jest.Mock).mockResolvedValue({
      available: true,
      reason: 'AVAILABLE',
      message: null,
      lastCounterActivityAt: new Date('2026-11-13T10:00:00.000Z'),
    });
    (recordRestaurantChange as jest.Mock).mockResolvedValue(undefined);
    (PostgresEventManager.publishOrderCreated as jest.Mock).mockResolvedValue(
      undefined
    );
    (
      PostgresEventManager.publishTableStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
    (autoUpdateTableStatus as jest.Mock).mockResolvedValue(undefined);

    tx.customerSession.update.mockResolvedValue({});
    tx.order.create.mockResolvedValue(createdOrder());
    tx.orderItem.create.mockResolvedValue({ id: 'item-1' });
    tx.orderItemOption.createMany.mockResolvedValue({});
    tx.orderDiscount.create.mockResolvedValue({});
    tx.diningSession.update.mockResolvedValue({});
    tx.loyaltyVisit.create.mockResolvedValue({});
    tx.loyaltyCard.update.mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );

    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({ kind: 'legacy' });
    (consumeQuote as jest.Mock).mockResolvedValue({
      ok: true,
      quote: {
        quoteId: 'quote-1',
        customerId: 'customer-1',
        phoneHash: 'hash-1',
        projectedTotal: new Decimal('55.68'),
        cashPayable: new Decimal('55.70'),
      },
    });
    (newLoyaltyOrderId as jest.Mock).mockReturnValue('order-1');
    (startOrderCreateRecord as jest.Mock).mockResolvedValue(undefined);
    (completeOrderCreateRecord as jest.Mock).mockResolvedValue(undefined);
    (findOrderCreateRecord as jest.Mock).mockResolvedValue(null);
    (orderCreateRequestHash as jest.Mock).mockReturnValue('request-hash');
    (getQuote as jest.Mock).mockResolvedValue({
      quoteId: 'quote-1',
      orderId: 'order-1',
      customerId: null,
      phoneHash: null,
    });
  });

  afterAll(() => {
    delete process.env.LOYALTY_ENABLED;
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
  });

  it('produces the legacy response byte-for-byte when the flag is off', async () => {
    delete process.env.LOYALTY_ENABLED;
    tx.order.create.mockResolvedValue(
      createdOrder({
        totalAmount: new Prisma.Decimal('10.6'),
        subtotalAmount: new Prisma.Decimal('10.00'),
        taxAmount: new Prisma.Decimal('0.60'),
        serviceCharge: new Prisma.Decimal('0'),
      })
    );

    const response = await createQrOrder(
      request({
        ...legacyBody,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
        customerInfo: {
          phone: '+60123456789',
          consent: true,
          consentVersion: 'v1',
          consentTextHash: 'hash',
        },
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(legacyResponseBody());
    expect(json).not.toHaveProperty('projectedTotal');
    expect(json).not.toHaveProperty('visitState');
    expect(json).not.toHaveProperty('loyaltyError');
    expect(prepareLoyaltyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: 'quote-1' })
    );
  });

  it('creates the order from a valid quote and applies the promotion', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'ready',
      plan: plan(),
    });

    const response = await createQrOrder(
      request(
        {
          tableId,
          sessionId,
          quoteId: 'quote-1',
          expectedTotal: '55.68',
          customerInfo: {
            phone: '+60123456789',
            consent: true,
            consentVersion: 'v1',
            consentTextHash: 'hash',
          },
        },
        { 'idempotency-key': 'key-1' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      projectedTotal: '55.68',
      visitState: 'PROMOTION',
      rewardLabel: null,
    });
    expect(json).not.toHaveProperty('loyaltyError');
    expect(json.order).toMatchObject({
      id: 'order-1',
      totalAmount: '55.68',
      subtotalAmount: 60,
      taxAmount: 2.88,
      serviceCharge: 4.8,
    });

    expect(consumeQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        quoteId: 'quote-1',
        sessionId,
        tableId,
        cartHash: 'cart-hash',
        customerId: 'customer-1',
        phoneHash: 'hash-1',
        expectedTotal: '55.68',
        orderId: 'order-1',
      }),
      tx
    );
    expect(tx.orderDiscount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          restaurantId,
          source: 'PROMOTION',
          sourceId: 'promo-1',
          amount: expect.anything(),
        }),
      })
    );
    expect(tx.diningSession.update).toHaveBeenCalledWith({
      where: { id: diningSessionId },
      data: { billRevision: { increment: 1 } },
    });
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.loyaltyCard.update).not.toHaveBeenCalled();
    expect(startOrderCreateRecord).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ key: 'key-1', requestHash: 'request-hash' })
    );
    expect(completeOrderCreateRecord).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ key: 'key-1' })
    );
  });

  it('returns the projected reward label but stores the pre-reward order', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'ready',
      plan: plan({
        computation: computation({
          projectedRewardAmount: new Decimal('15.00'),
          discountAmount: new Decimal('15.00'),
          projectedTotal: new Decimal('55.68'),
          visitState: 'COUNTS',
          promotionApplied: false,
          promotionScope: null,
          promotionLabel: null,
          promotionItems: [],
          promotionIds: [],
          cartPromotion: null,
          rewardLabel: '10% off, max RM15',
        }),
        cartPromotion: null,
      }),
    });
    tx.order.create.mockResolvedValue(
      createdOrder({
        totalAmount: new Prisma.Decimal('55.68'),
        discountAmount: new Prisma.Decimal('0'),
      })
    );

    const response = await createQrOrder(
      request({
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
      })
    );
    const json = await response.json();

    expect(json).toMatchObject({
      projectedTotal: '55.68',
      rewardLabel: '10% off, max RM15',
      visitState: 'COUNTS',
    });
    expect(tx.orderDiscount.create).not.toHaveBeenCalled();
    expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    expect(tx.loyaltyCard.update).not.toHaveBeenCalled();
  });

  it('rejects a stale, expired or reused quote with QUOTE_CHANGED', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'error',
      status: 409,
      code: 'QUOTE_CHANGED',
      message: 'The quote is no longer valid. Request a new quote.',
    });

    const response = await createQrOrder(
      request({
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      success: false,
      code: 'QUOTE_CHANGED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a member-mismatched quote with QUOTE_CHANGED', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'error',
      status: 409,
      code: 'QUOTE_CHANGED',
      message: 'The quote is no longer valid. Request a new quote.',
    });

    const response = await createQrOrder(
      request({
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
        customerInfo: { phone: '+60199999999', consent: true },
      })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('QUOTE_CHANGED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['PHONE_INVALID', 'Enter a valid mobile number'],
    ['CONSENT_REQUIRED', 'Please agree to the rewards notice'],
    ['CONSENT_STALE', 'The rewards notice changed'],
  ])(
    'creates a guest order with loyaltyError %s instead of failing',
    async (code, message) => {
      (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
        kind: 'ready',
        plan: plan({
          customerId: null,
          phoneHash: null,
          guestError: { code, message },
          computation: computation({
            visitState: 'GUEST',
            promotionApplied: false,
            promotionScope: null,
            promotionLabel: null,
            promotionItems: [],
            promotionIds: [],
            cartPromotion: null,
            promotionDiscountAmount: new Decimal(0),
            discountAmount: new Decimal(0),
          }),
          cartPromotion: null,
        }),
      });

      const response = await createQrOrder(
        request({
          tableId,
          sessionId,
          quoteId: 'quote-1',
          expectedTotal: '55.68',
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.loyaltyError).toEqual({ code, message });
      expect(json.order).toBeDefined();
      expect(tx.loyaltyVisit.create).not.toHaveBeenCalled();
    }
  );

  it('replays the original order without consuming the quote again', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'replay',
      status: 200,
      body: {
        success: true,
        order: { id: 'order-original', totalAmount: '55.68' },
        projectedTotal: '55.68',
      },
    });

    const response = await createQrOrder(
      request(
        { tableId, sessionId, quoteId: 'quote-1', expectedTotal: '55.68' },
        { 'idempotency-key': 'key-1' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.order.id).toBe('order-original');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(consumeQuote).not.toHaveBeenCalled();
  });

  it('replays a completed create even after the cart was cleared', async () => {
    (findOrderCreateRecord as jest.Mock).mockResolvedValue({
      status: 'COMPLETED',
      requestHash: 'request-hash',
      responseJson: {
        success: true,
        order: { id: 'order-original' },
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    (getQuote as jest.Mock).mockResolvedValue({
      quoteId: 'quote-1',
      orderId: 'order-original',
      customerId: null,
      phoneHash: null,
    });
    (getTableCart as jest.Mock).mockResolvedValue({
      sessionId,
      items: [],
      totalItems: 0,
      totalAmount: 0,
    });

    const response = await createQrOrder(
      request(
        { tableId, sessionId, quoteId: 'quote-1', expectedTotal: '55.68' },
        { 'idempotency-key': 'key-1' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.order.id).toBe('order-original');
    expect(getTableCart).not.toHaveBeenCalled();
    expect(prepareLoyaltyCreate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(orderCreateRequestHash).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
      })
    );
  });

  it('returns IDEMPOTENCY_MISMATCH when the same key is used with a different body', async () => {
    (findOrderCreateRecord as jest.Mock).mockResolvedValue({
      status: 'COMPLETED',
      requestHash: 'different-hash',
      responseJson: {
        success: true,
        order: { id: 'order-original' },
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await createQrOrder(
      request(
        { tableId, sessionId, quoteId: 'quote-1', expectedTotal: '55.68' },
        { 'idempotency-key': 'key-1' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_MISMATCH',
    });
    expect(getTableCart).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns IDEMPOTENCY_MISMATCH when the stored order did not consume the quote', async () => {
    (findOrderCreateRecord as jest.Mock).mockResolvedValue({
      status: 'COMPLETED',
      requestHash: 'request-hash',
      responseJson: {
        success: true,
        order: { id: 'order-original' },
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    (getQuote as jest.Mock).mockResolvedValue({
      quoteId: 'quote-1',
      orderId: 'order-other',
      customerId: null,
      phoneHash: null,
    });

    const response = await createQrOrder(
      request(
        { tableId, sessionId, quoteId: 'quote-1', expectedTotal: '55.68' },
        { 'idempotency-key': 'key-1' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('IDEMPOTENCY_MISMATCH');
    expect(getTableCart).not.toHaveBeenCalled();
  });

  it('does not use the loyalty early replay when the flag is off (F-04)', async () => {
    delete process.env.LOYALTY_ENABLED;
    (findOrderCreateRecord as jest.Mock).mockResolvedValue({
      status: 'COMPLETED',
      requestHash: 'request-hash',
      responseJson: {
        success: true,
        order: { id: 'order-original' },
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await createQrOrder(
      request(
        {
          tableId,
          sessionId,
          quoteId: 'quote-1',
          expectedTotal: '55.68',
        },
        { 'idempotency-key': 'key-1' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).not.toHaveProperty('projectedTotal');
    expect(findOrderCreateRecord).not.toHaveBeenCalled();
    expect(getQuote).not.toHaveBeenCalled();
  });

  it('rejects a second create with the same quote and a different key', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'error',
      status: 409,
      code: 'QUOTE_CHANGED',
      message: 'The quote is no longer valid. Request a new quote.',
    });

    const response = await createQrOrder(
      request(
        { tableId, sessionId, quoteId: 'quote-1', expectedTotal: '55.68' },
        { 'idempotency-key': 'key-2' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('QUOTE_CHANGED');
    expect(consumeQuote).not.toHaveBeenCalled();
  });

  it('returns QUOTE_CHANGED for a malformed expectedTotal, never a 500 (F-03)', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'error',
      status: 409,
      code: 'QUOTE_CHANGED',
      message: 'The quote is no longer valid. Request a new quote.',
    });

    const response = await createQrOrder(
      request({
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: 'not-money',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('QUOTE_CHANGED');
  });

  it('passes the table restaurant to the loyalty preparation (tenant isolation)', async () => {
    await createQrOrder(
      request({
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
      })
    );

    expect(prepareLoyaltyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        tableId,
        sessionId,
      })
    );
  });

  it('keeps the pre-P4 400 for an invalid phone when no quote is supplied', async () => {
    const response = await createQrOrder(
      request({ tableId, customerInfo: { phone: '123' } })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid request data');
    expect(prepareLoyaltyCreate).not.toHaveBeenCalled();
  });

  it('does not accept marketingOptIn on the QR create', async () => {
    await createQrOrder(
      request({
        tableId,
        customerInfo: { phone: '+60123456789', marketingOptIn: true },
      })
    );

    const call = (prepareLoyaltyCreate as jest.Mock).mock.calls[0][0] as {
      customerInfo: Record<string, unknown>;
    };
    expect(call.customerInfo).not.toHaveProperty('marketingOptIn');
  });

  it('accepts a malformed phone with a quote as a guest fallback', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'ready',
      plan: plan({
        customerId: null,
        phoneHash: null,
        guestError: {
          code: 'PHONE_INVALID',
          message: 'Enter a valid mobile number',
        },
        computation: computation({
          visitState: 'GUEST',
          promotionApplied: false,
          promotionScope: null,
          promotionLabel: null,
          promotionItems: [],
          promotionIds: [],
          cartPromotion: null,
          promotionDiscountAmount: new Decimal(0),
          discountAmount: new Decimal(0),
        }),
        cartPromotion: null,
      }),
    });

    const response = await createQrOrder(
      request({
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
        customerInfo: { phone: '123' },
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.loyaltyError).toEqual({
      code: 'PHONE_INVALID',
      message: 'Enter a valid mobile number',
    });
  });

  it('returns a normal guest order with no loyaltyError when no phone is supplied (F-01)', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'ready',
      plan: plan({
        customerId: null,
        phoneHash: null,
        guestError: null,
        computation: computation({
          visitState: 'GUEST',
          promotionApplied: false,
          promotionScope: null,
          promotionLabel: null,
          promotionItems: [],
          promotionIds: [],
          cartPromotion: null,
          promotionDiscountAmount: new Decimal(0),
          discountAmount: new Decimal(0),
        }),
        cartPromotion: null,
      }),
    });

    const response = await createQrOrder(
      request({
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.visitState).toBe('GUEST');
    expect(json).not.toHaveProperty('loyaltyError');
    expect(JSON.stringify(json)).not.toContain('Enter a valid mobile number');
    expect(JSON.stringify(json)).not.toContain('Please agree to the rewards');
  });

  it('returns QUOTE_CHANGED when the in-transaction consume fails', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'ready',
      plan: plan(),
    });
    (consumeQuote as jest.Mock).mockResolvedValue({
      ok: false,
      loyaltyError: {
        code: 'QUOTE_CHANGED',
        message: 'The quote is no longer valid. Request a new quote.',
      },
    });

    const response = await createQrOrder(
      request({
        tableId,
        sessionId,
        quoteId: 'quote-1',
        expectedTotal: '55.68',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('QUOTE_CHANGED');
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.orderDiscount.create).not.toHaveBeenCalled();
  });

  it('replays the completed record when a concurrent idempotency insert loses', async () => {
    (prepareLoyaltyCreate as jest.Mock).mockResolvedValue({
      kind: 'ready',
      plan: plan(),
    });
    (startOrderCreateRecord as jest.Mock).mockRejectedValue({ code: 'P2002' });
    (findOrderCreateRecord as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: 'COMPLETED',
        requestHash: 'request-hash',
        responseJson: {
          success: true,
          order: { id: 'order-winner' },
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

    const response = await createQrOrder(
      request(
        { tableId, sessionId, quoteId: 'quote-1', expectedTotal: '55.68' },
        { 'idempotency-key': 'key-1' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.order.id).toBe('order-winner');
  });
});
