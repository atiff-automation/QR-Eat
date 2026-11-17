import Decimal from 'decimal.js';
import { prisma } from '@/lib/database';
import { hashNoticeText } from '@/lib/loyalty/consent';
import { hashPhone } from '@/lib/loyalty/phone';
import {
  CART_ORDER_ID,
  cartLinesFromItems,
  computeBillQuote,
  findOrderCreateRecord,
  guestErrorFor,
  orderCreateRequestHash,
  prepareLoyaltyCreate,
  quoteMatchesComputation,
  type BillOrderInput,
  type ComputeBillQuoteInput,
} from '@/lib/services/loyalty-qr-service';
import type { QuoteView } from '@/lib/services/loyalty-quote-service';
import { calculateOrderTotals } from '@/lib/order-utils';
import type {
  PromotionCandidate,
  PromotionLine,
} from '@/lib/loyalty/promotion';
import type { RewardCardSnapshot, RewardRule } from '@/lib/loyalty/reward';

jest.mock('@/lib/database', () => ({
  prisma: {
    loyaltySettings: { findUnique: jest.fn() },
    quote: { findFirst: jest.fn() },
    idempotencyRecord: { findFirst: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    diningSession: { findFirst: jest.fn() },
    order: { findMany: jest.fn() },
    promotion: { findMany: jest.fn() },
    menuItem: { findMany: jest.fn() },
    paymentBatch: { findMany: jest.fn() },
    loyaltyCard: { findUnique: jest.fn() },
    loyaltyVisit: { findFirst: jest.fn() },
  },
}));

jest.mock('@/lib/services/loyalty-customer-service', () => ({
  resolveOrCreateCustomer: jest.fn(),
}));

import { resolveOrCreateCustomer } from '@/lib/services/loyalty-customer-service';

const now = new Date('2026-11-13T10:00:00.000Z');

const settings: RewardRule = {
  visitsRequired: 3,
  rewardType: 'PERCENT',
  rewardValue: '10.00',
  maxDiscount: '15.00',
  rewardLabel: '10% off, max RM15',
  minDailySpend: '20.00',
};

const pasta: PromotionLine = {
  itemId: 'item-1',
  categoryId: 'cat-1',
  name: 'Pasta',
  lineTotal: '60.00',
};

const drink: PromotionLine = {
  itemId: 'item-2',
  categoryId: 'cat-2',
  name: 'Drink',
  lineTotal: '40.00',
};

function promotion(
  overrides: Partial<PromotionCandidate> = {}
): PromotionCandidate {
  return {
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
    ...overrides,
  };
}

function cartOrder(
  lines: PromotionLine[] = [pasta],
  subtotal = '60.00'
): BillOrderInput {
  return {
    orderId: CART_ORDER_ID,
    subtotal,
    taxRate: '0.06',
    serviceRate: '0.10',
    lines,
  };
}

function quoteInput(
  overrides: Partial<ComputeBillQuoteInput> = {}
): ComputeBillQuoteInput {
  return {
    orders: [cartOrder()],
    promotions: [],
    settings,
    card: null,
    hasMember: true,
    hasConsent: true,
    alreadyCounted: false,
    daySubtotal: '60.00',
    cashRounding: 'NEAREST_5_SEN',
    billRevision: 7,
    now,
    ...overrides,
  };
}

function card(overrides: Partial<RewardCardSnapshot> = {}): RewardCardSnapshot {
  return {
    visitsInCycle: 2,
    cycleNumber: 1,
    ...settings,
    ...overrides,
  };
}

describe('loyalty QR quote computation', () => {
  it('prices a promotion on the whole cart bill', () => {
    const quote = computeBillQuote(quoteInput({ promotions: [promotion()] }));

    expect(quote.visitState).toBe('PROMOTION');
    expect(quote.promotionApplied).toBe(true);
    expect(quote.promotionScope).toBe('ITEM');
    expect(quote.promotionLabel).toBe('Lunch 20%');
    expect(quote.promotionItems).toEqual([{ itemId: 'item-1', name: 'Pasta' }]);
    expect(quote.subtotal.toString()).toBe('60');
    expect(quote.promotionDiscountAmount.toString()).toBe('12');
    expect(quote.projectedRewardAmount.toString()).toBe('0');
    expect(quote.discountAmount.toString()).toBe('12');
    expect(quote.discountedSubtotal.toString()).toBe('48');
    expect(quote.taxAmount.toString()).toBe('2.88');
    expect(quote.serviceCharge.toString()).toBe('4.8');
    expect(quote.totalAmount.toString()).toBe('55.68');
    expect(quote.projectedTotal.toString()).toBe('55.68');
    expect(quote.cashPayable.toString()).toBe('55.7');
    expect(quote.discountLines).toEqual([
      { source: 'PROMOTION', label: 'Lunch 20%', amount: expect.anything() },
    ]);
    expect(quote.discountLines[0].amount.toString()).toBe('12');
    expect(quote.message).toContain('Lunch 20% applied to Pasta');
    expect(quote.message).toContain('This visit will not count');
  });

  it('keeps a guest quote guest even when a promotion applies', () => {
    const quote = computeBillQuote(
      quoteInput({
        promotions: [promotion()],
        hasMember: false,
        hasConsent: false,
        guestReason: 'NO_PHONE',
      })
    );

    expect(quote.visitState).toBe('GUEST');
    expect(quote.promotionApplied).toBe(true);
    expect(quote.projectedRewardAmount.toString()).toBe('0');
    expect(quote.message).toBe('Promotion applied. No visit tracked.');
  });

  it('returns the no-amount below-minimum copy at the QR', () => {
    const quote = computeBillQuote(
      quoteInput({
        daySubtotal: '10.00',
        settings: { ...settings, minDailySpend: '20.00' },
      })
    );

    expect(quote.visitState).toBe('BELOW_MINIMUM');
    expect(quote.projectedRewardAmount.toString()).toBe('0');
    expect(quote.message).toBe(
      'This visit needs the minimum daily spend. Staff can help at the counter.'
    );
    expect(quote.message).not.toContain('RM');
    expect(quote.message).not.toContain('10.00');
  });

  it('projects and allocates the third-visit reward without writing it', () => {
    const quote = computeBillQuote(
      quoteInput({
        orders: [cartOrder([pasta], '150.00')],
        card: card({ visitsInCycle: 2 }),
      })
    );

    expect(quote.visitState).toBe('COUNTS');
    expect(quote.projectedRewardAmount.toString()).toBe('15');
    expect(quote.discountAmount.toString()).toBe('15');
    expect(quote.taxAmount.toString()).toBe('8.1');
    expect(quote.serviceCharge.toString()).toBe('13.5');
    expect(quote.projectedTotal.toString()).toBe('156.6');
    expect(quote.rewardType).toBe('PERCENT');
    expect(quote.rewardValue).toBe('10');
    expect(quote.maxDiscount.toString()).toBe('15');
    expect(quote.discountLines[0]).toMatchObject({
      source: 'LOYALTY_REWARD',
      label: '10% off, max RM15',
    });
    expect(quote.message).toContain('applied; card resets');
  });

  it('prices a plain counting visit with zero discount parity', () => {
    const quote = computeBillQuote(
      quoteInput({ card: card({ visitsInCycle: 0 }) })
    );
    const legacy = calculateOrderTotals([{ totalPrice: 60 }], 0.06, 0.1);

    expect(quote.visitState).toBe('COUNTS');
    expect(quote.promotionApplied).toBe(false);
    expect(quote.discountAmount.toString()).toBe('0');
    expect(quote.taxAmount.toNumber()).toBe(legacy.taxAmount);
    expect(quote.serviceCharge.toNumber()).toBe(legacy.serviceCharge);
    expect(quote.totalAmount.toNumber()).toBe(legacy.totalAmount);
    expect(quote.message).toBe('This visit counts: 0 of 3.');
  });

  it('uses ORDER scope copy with an empty promotionItems list', () => {
    const quote = computeBillQuote(
      quoteInput({
        promotions: [
          promotion({
            scope: 'ORDER',
            itemIds: [],
            value: '10.00',
          }),
        ],
      })
    );

    expect(quote.promotionScope).toBe('ORDER');
    expect(quote.promotionItems).toEqual([]);
    expect(quote.promotionDiscountAmount.toString()).toBe('6');
    expect(quote.message).toContain('Lunch 20% applied to this order');
  });

  it('resolves category scope to its eligible items', () => {
    const quote = computeBillQuote(
      quoteInput({
        promotions: [
          promotion({
            scope: 'CATEGORY',
            categoryIds: ['cat-1'],
            itemIds: [],
          }),
        ],
      })
    );

    expect(quote.promotionScope).toBe('CATEGORY');
    expect(quote.promotionItems).toEqual([{ itemId: 'item-1', name: 'Pasta' }]);
  });

  it('marks a mixed bill MULTIPLE and keeps one line per order', () => {
    const quote = computeBillQuote(
      quoteInput({
        orders: [
          cartOrder([pasta], '60.00'),
          {
            orderId: 'order-1',
            subtotal: '40.00',
            taxRate: '0.06',
            serviceRate: '0.10',
            lines: [drink],
          },
        ],
        promotions: [
          promotion(),
          promotion({
            id: 'promo-2',
            name: 'Drink 10%',
            receiptLabel: 'Drink 10%',
            scope: 'ORDER',
            itemIds: [],
            value: '10.00',
          }),
        ],
      })
    );

    expect(quote.promotionScope).toBe('MULTIPLE');
    expect(quote.promotionLabel).toBe('Promotions');
    expect(quote.promotionApplied).toBe(true);
    expect(quote.projectedRewardAmount.toString()).toBe('0');
    expect(quote.discountLines).toHaveLength(2);
    expect(quote.promotionItems).toEqual([{ itemId: 'item-1', name: 'Pasta' }]);
  });

  it('never returns spend, minimum, member or amount-to-minimum fields', () => {
    const quote = computeBillQuote(quoteInput({ promotions: [promotion()] }));
    const wire = JSON.parse(JSON.stringify(quote)) as Record<string, unknown>;

    expect(wire).not.toHaveProperty('daySubtotal');
    expect(wire).not.toHaveProperty('minDailySpend');
    expect(wire).not.toHaveProperty('amountToMinimum');
    expect(wire).not.toHaveProperty('customerId');
    expect(wire).not.toHaveProperty('phone');
    expect(wire).not.toHaveProperty('phoneHash');
  });

  it('allocates a reward across the whole bill proportionally', () => {
    const quote = computeBillQuote(
      quoteInput({
        orders: [
          cartOrder([pasta], '60.00'),
          {
            orderId: 'order-1',
            subtotal: '40.00',
            taxRate: '0.06',
            serviceRate: '0.10',
            lines: [drink],
          },
        ],
        card: card({ visitsInCycle: 2 }),
      })
    );

    expect(quote.projectedRewardAmount.toString()).toBe('10');
    const rewardLines = quote.discountLines.filter(
      (line) => line.source === 'LOYALTY_REWARD'
    );
    expect(rewardLines).toHaveLength(2);
    expect(
      rewardLines
        .reduce((sum, line) => sum.plus(line.amount), new Decimal(0))
        .toString()
    ).toBe('10');
    expect(rewardLines[0].amount.toString()).toBe('6');
    expect(rewardLines[1].amount.toString()).toBe('4');
  });

  it('applies cash rounding only under NEAREST_5_SEN', () => {
    const rounded = computeBillQuote(
      quoteInput({ promotions: [promotion()], cashRounding: 'NEAREST_5_SEN' })
    );
    const exact = computeBillQuote(
      quoteInput({ promotions: [promotion()], cashRounding: 'NONE' })
    );

    expect(rounded.projectedTotal.toString()).toBe('55.68');
    expect(rounded.cashPayable.toString()).toBe('55.7');
    expect(exact.cashPayable.toString()).toBe('55.68');
  });

  it('maps cart rows to the canonical binding lines', () => {
    const lines = cartLinesFromItems([
      {
        menuItemId: 'item-1',
        quantity: 2,
        unitPrice: '12.50',
        subtotal: '25.00',
        selectedOptions: [{ id: 'option-b' }, { id: 'option-a' }],
      },
    ]);

    expect(lines).toEqual([
      {
        itemId: 'item-1',
        quantity: 2,
        optionIds: ['option-b', 'option-a'],
        unitPrice: '12.50',
      },
    ]);
  });

  it('uses the generic loyalty copy for the member-resolution race (N-01)', () => {
    const quote = computeBillQuote(
      quoteInput({
        hasMember: false,
        hasConsent: false,
        guestReason: 'MEMBER_RESOLUTION_FAILED',
      })
    );

    expect(quote.visitState).toBe('GUEST');
    expect(quote.message).toBe(
      'Could not add rewards. Staff can help at the counter.'
    );
    expect(quote.message).not.toBe('Loyalty is off for this restaurant.');
  });
});

describe('quoteMatchesComputation', () => {
  const computation = computeBillQuote(
    quoteInput({ promotions: [promotion()] })
  );

  function quoteView(overrides: Partial<QuoteView> = {}): QuoteView {
    return {
      quoteId: 'quote-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      sessionId: 'session-1',
      cartKey: null,
      cartHash: 'cart-hash',
      billRevision: 7,
      customerId: null,
      phoneHash: null,
      promotionIds: computation.promotionIds,
      promotionDiscountAmount: computation.promotionDiscountAmount,
      visitState: computation.visitState,
      projectedRewardAmount: computation.projectedRewardAmount,
      rewardLabel: computation.rewardLabel,
      subtotal: computation.subtotal,
      discountAmount: computation.discountAmount,
      taxAmount: computation.taxAmount,
      serviceCharge: computation.serviceCharge,
      totalAmount: computation.totalAmount,
      projectedTotal: computation.projectedTotal,
      cashPayable: computation.cashPayable,
      issuedAt: now,
      expiresAt: now,
      consumedAt: null,
      orderId: null,
      ...overrides,
    };
  }

  it('accepts a quote that matches the fresh reprice', () => {
    expect(quoteMatchesComputation(quoteView(), computation)).toBe(true);
  });

  it('rejects a changed total, visit state or promotion set', () => {
    expect(
      quoteMatchesComputation(
        quoteView({ projectedTotal: new Decimal('55.69') }),
        computation
      )
    ).toBe(false);
    expect(
      quoteMatchesComputation(quoteView({ visitState: 'COUNTS' }), computation)
    ).toBe(false);
    expect(
      quoteMatchesComputation(quoteView({ promotionIds: [] }), computation)
    ).toBe(false);
    expect(
      quoteMatchesComputation(
        quoteView({ rewardLabel: 'different' }),
        computation
      )
    ).toBe(false);
  });
});

describe('guestErrorFor', () => {
  it('emits no loyaltyError for a plain no-phone guest (F-01)', () => {
    expect(guestErrorFor('NO_PHONE')).toBeNull();
  });

  it('uses only contract codes for recoverable guest fallbacks', () => {
    expect(guestErrorFor('PHONE_INVALID')).toMatchObject({
      code: 'PHONE_INVALID',
    });
    expect(guestErrorFor('CONSENT_REQUIRED')).toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
    expect(guestErrorFor('CONSENT_VERSION_REQUIRED')).toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
    expect(guestErrorFor('CONSENT_STALE')).toMatchObject({
      code: 'CONSENT_STALE',
    });
  });

  it('keeps the generic copy for the member-resolution race', () => {
    expect(guestErrorFor('MEMBER_RESOLUTION_FAILED')).toEqual({
      code: 'LOYALTY_DISABLED',
      message: 'Could not add rewards. Staff can help at the counter.',
    });
  });
});

describe('orderCreateRequestHash', () => {
  const base = {
    restaurantId: 'restaurant-1',
    tableId: 'table-1',
    sessionId: 'session-1',
    quoteId: 'quote-1',
    expectedTotal: '55.68',
    customerInfo: {
      phone: '+60123456789',
      consent: true,
      consentVersion: 'v1',
      consentTextHash: 'hash',
    },
  };

  const originalKey = process.env.LOYALTY_PHONE_HMAC_KEY;

  beforeEach(() => {
    // F-08: the request hash is a keyed HMAC, so the key is required.
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.LOYALTY_PHONE_HMAC_KEY;
    } else {
      process.env.LOYALTY_PHONE_HMAC_KEY = originalKey;
    }
  });

  it('is stable for the same body', () => {
    expect(orderCreateRequestHash(base)).toBe(orderCreateRequestHash(base));
  });

  it('changes when the body changes', () => {
    const hash = orderCreateRequestHash(base);

    expect(
      orderCreateRequestHash({ ...base, expectedTotal: '55.69' })
    ).not.toBe(hash);
    expect(orderCreateRequestHash({ ...base, quoteId: 'quote-2' })).not.toBe(
      hash
    );
    expect(
      orderCreateRequestHash({
        ...base,
        customerInfo: { ...base.customerInfo, phone: '+60199999999' },
      })
    ).not.toBe(hash);
    expect(
      orderCreateRequestHash({
        ...base,
        customerInfo: { ...base.customerInfo, consent: false },
      })
    ).not.toBe(hash);
  });
});

describe('findOrderCreateRecord', () => {
  const now = new Date('2026-11-13T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters by the 24-hour retention window and treats expiry as absent (F-09)', async () => {
    (prisma.idempotencyRecord.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await findOrderCreateRecord('restaurant-1', 'key-1', now);

    expect(result).toBeNull();
    expect(prisma.idempotencyRecord.findFirst).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-1',
        scope: 'ORDER_CREATE',
        key: 'key-1',
        expiresAt: { gt: now },
      },
      select: {
        status: true,
        requestHash: true,
        responseJson: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  });

  it('returns a live record', async () => {
    const expiresAt = new Date(now.getTime() + 60_000);
    (prisma.idempotencyRecord.findFirst as jest.Mock).mockResolvedValue({
      status: 'COMPLETED',
      requestHash: 'hash',
      responseJson: { success: true },
      createdAt: now,
      expiresAt,
    });

    const result = await findOrderCreateRecord('restaurant-1', 'key-1', now);

    expect(result).toEqual({
      status: 'COMPLETED',
      requestHash: 'hash',
      responseJson: { success: true },
      createdAt: now,
      expiresAt,
    });
  });
});

describe('prepareLoyaltyCreate guards', () => {
  const noticeText = 'Rewards notice v1';
  const settingsRow = {
    restaurantId: 'restaurant-1',
    enabled: true,
    visitsRequired: 3,
    rewardType: 'PERCENT',
    rewardValue: new Decimal('10.00'),
    maxDiscount: new Decimal('15.00'),
    minDailySpend: new Decimal('20.00'),
    rewardLabel: '10% off, max RM15',
    noticeVersion: 'v1',
    noticeText,
    noticeTextHash: hashNoticeText(noticeText),
    privacyUrl: 'https://example.test/privacy',
    termsText: null,
  };

  const input = {
    restaurantId: 'restaurant-1',
    tableId: 'table-1',
    sessionId: 'session-1',
    cart: { items: [] },
    quoteId: 'quote-1',
    expectedTotal: '55.68',
  };

  function quoteRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'quote-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      sessionId: 'session-1',
      cartKey: 'cart-key',
      cartHash: 'cart-hash',
      billRevision: 7,
      customerId: null,
      phoneHash: null,
      promotionDiscountAmount: new Decimal('0.00'),
      visitState: 'GUEST',
      projectedRewardAmount: new Decimal('0.00'),
      rewardLabel: null,
      subtotal: new Decimal('60.00'),
      discountAmount: new Decimal('0.00'),
      taxAmount: new Decimal('3.60'),
      serviceCharge: new Decimal('6.00'),
      totalAmount: new Decimal('69.60'),
      projectedTotal: new Decimal('69.60'),
      cashPayable: new Decimal('69.60'),
      issuedAt: new Date('2026-11-13T09:55:00.000Z'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
      orderId: null,
      quotePromotions: [],
      ...overrides,
    };
  }

  function guestQuoteRow() {
    return quoteRow({
      billRevision: 0,
      subtotal: new Decimal('0.00'),
      discountAmount: new Decimal('0.00'),
      taxAmount: new Decimal('0.00'),
      serviceCharge: new Decimal('0.00'),
      totalAmount: new Decimal('0.00'),
      projectedTotal: new Decimal('0.00'),
      cashPayable: new Decimal('0.00'),
      rewardLabel: settingsRow.rewardLabel,
      visitState: 'GUEST',
    });
  }

  function mockEmptyGuestReprice() {
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      id: 'restaurant-1',
      currency: 'MYR',
      taxRate: '0.06',
      serviceChargeRate: '0.10',
      timezone: 'Asia/Kuala_Lumpur',
      businessDayCloseTime: '04:00',
      cashRounding: 'NEAREST_5_SEN',
    });
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.promotion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.quote.findFirst as jest.Mock).mockResolvedValue(guestQuoteRow());
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_ENABLED = 'true';
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue(
      settingsRow
    );
  });

  afterAll(() => {
    delete process.env.LOYALTY_ENABLED;
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
  });

  it('returns legacy without a database read when the flag is off', async () => {
    delete process.env.LOYALTY_ENABLED;

    const result = await prepareLoyaltyCreate(input);

    expect(result).toEqual({ kind: 'legacy' });
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
  });

  it('returns QUOTE_CHANGED for a malformed expectedTotal (F-03)', async () => {
    const result = await prepareLoyaltyCreate({
      ...input,
      expectedTotal: 'not-money',
    });

    expect(result).toMatchObject({
      kind: 'error',
      status: 409,
      code: 'QUOTE_CHANGED',
    });
    expect(prisma.quote.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a phone attached to a guest quote before creating a member (F-01)', async () => {
    (resolveOrCreateCustomer as jest.Mock).mockResolvedValue({
      customerId: 'customer-1',
      isNew: true,
      consentOk: true,
      loyaltyError: null,
    });
    (prisma.quote.findFirst as jest.Mock).mockResolvedValue(quoteRow());

    const result = await prepareLoyaltyCreate({
      ...input,
      customerInfo: {
        phone: '+60123456789',
        consent: true,
        consentVersion: 'v1',
        consentTextHash: hashNoticeText(noticeText),
      },
    });

    expect(result).toMatchObject({
      kind: 'error',
      status: 409,
      code: 'QUOTE_CHANGED',
    });
    // The guard runs before `resolveMember()`, so no Customer row is written.
    expect(resolveOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('returns a 200 guest order with CONSENT_REQUIRED when consent is unticked (B-UX-1)', async () => {
    mockEmptyGuestReprice();

    const result = await prepareLoyaltyCreate({
      ...input,
      expectedTotal: '0.00',
      customerInfo: { phone: '+60123456789', consent: false },
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('expected a ready plan');
    expect(result.plan.guestError).toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(result.plan.customerId).toBeNull();
    expect(result.plan.phoneHash).toBeNull();
    expect(result.plan.memberIsNew).toBe(false);
    // No member, consent or visit write can happen on the guest path.
    expect(resolveOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('returns a 200 guest order with PHONE_INVALID for a malformed phone (B-UX-1)', async () => {
    mockEmptyGuestReprice();

    const result = await prepareLoyaltyCreate({
      ...input,
      expectedTotal: '0.00',
      customerInfo: { phone: 'not-a-phone', consent: false },
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('expected a ready plan');
    expect(result.plan.guestError).toMatchObject({ code: 'PHONE_INVALID' });
    expect(result.plan.customerId).toBeNull();
    expect(resolveOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('returns a 200 guest order with CONSENT_STALE for an unverifiable proof (B-UX-1)', async () => {
    mockEmptyGuestReprice();

    const result = await prepareLoyaltyCreate({
      ...input,
      expectedTotal: '0.00',
      customerInfo: {
        phone: '+60123456789',
        consent: true,
        consentVersion: 'v0',
        consentTextHash: hashNoticeText('old notice'),
      },
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('expected a ready plan');
    expect(result.plan.guestError).toMatchObject({ code: 'CONSENT_STALE' });
    expect(result.plan.customerId).toBeNull();
    expect(resolveOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('rejects a different phone on a phone-bound quote before creating a member (F-01a)', async () => {
    (resolveOrCreateCustomer as jest.Mock).mockResolvedValue({
      customerId: 'customer-a',
      isNew: false,
      consentOk: true,
      loyaltyError: null,
    });
    (prisma.quote.findFirst as jest.Mock).mockResolvedValue(
      quoteRow({
        customerId: 'customer-a',
        phoneHash: hashPhone('+60123456789'),
      })
    );

    const result = await prepareLoyaltyCreate({
      ...input,
      customerInfo: {
        // A different phone with valid consent. Without the binding check this
        // would autocommit a Customer row for phone B.
        phone: '+60198765432',
        consent: true,
        consentVersion: 'v1',
        consentTextHash: hashNoticeText(noticeText),
      },
    });

    expect(result).toMatchObject({
      kind: 'error',
      status: 409,
      code: 'QUOTE_CHANGED',
    });
    expect(resolveOrCreateCustomer).not.toHaveBeenCalled();
  });
});
