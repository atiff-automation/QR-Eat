import { prisma, type TransactionClient } from '@/lib/database';
import {
  QUOTE_TTL_MS,
  cartHash,
  consumeQuote,
  getQuote,
  issueQuote,
  type CartLine,
  type ConsumeQuoteInput,
  type QuotePricingInput,
} from '@/lib/services/loyalty-quote-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    quote: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const otherRestaurantId = '550e8400-e29b-41d4-a716-446655440099';
const now = new Date('2026-11-13T10:00:00.000Z');

const lines: CartLine[] = [
  {
    itemId: 'item-1',
    quantity: 2,
    optionIds: ['option-b', 'option-a'],
    unitPrice: '12.50',
  },
  {
    itemId: 'item-2',
    quantity: 1,
    optionIds: [],
    unitPrice: '20.00',
  },
];

const pricing: QuotePricingInput = {
  subtotal: '45.00',
  promotionDiscountAmount: '9.00',
  projectedRewardAmount: '0.00',
  discountAmount: '9.00',
  taxAmount: '2.16',
  serviceCharge: '3.60',
  totalAmount: '41.76',
  projectedTotal: '41.76',
  cashPayable: '41.75',
  visitState: 'PROMOTION',
  rewardLabel: '10% off, max RM15',
};

interface QuoteFixture {
  id: string;
  restaurantId: string;
  sessionId: string | null;
  tableId: string | null;
  cartHash: string;
  customerId: string | null;
  phoneHash: string | null;
  projectedTotal: string;
  cashPayable: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

function quoteFixture(overrides: Partial<QuoteFixture> = {}): QuoteFixture {
  return {
    id: 'quote-1',
    restaurantId,
    sessionId: null,
    tableId: null,
    cartHash: cartHash(lines),
    customerId: null,
    phoneHash: null,
    projectedTotal: '41.76',
    cashPayable: '41.75',
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
    consumedAt: null,
    ...overrides,
  };
}

function makeTx(quote: QuoteFixture | null, updateCount = 1) {
  const findFirst = jest.fn().mockResolvedValue(quote);
  const updateMany = jest.fn().mockResolvedValue({ count: updateCount });

  return {
    tx: { quote: { findFirst, updateMany } } as unknown as TransactionClient,
    findFirst,
    updateMany,
  };
}

function consumeInput(
  overrides: Partial<ConsumeQuoteInput> = {}
): ConsumeQuoteInput {
  return {
    restaurantId,
    quoteId: 'quote-1',
    cartHash: cartHash(lines),
    customerId: null,
    phoneHash: null,
    expectedTotal: '41.76',
    orderId: 'order-1',
    now,
    ...overrides,
  };
}

describe('loyalty quote service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cartHash', () => {
    it('is order-independent', () => {
      const reordered: CartLine[] = [
        lines[1],
        { ...lines[0], optionIds: ['option-a', 'option-b'] },
      ];

      expect(cartHash(reordered)).toBe(cartHash(lines));
    });

    it('changes when an item, quantity, option or price changes', () => {
      const base = cartHash(lines);

      expect(cartHash([{ ...lines[0], itemId: 'item-3' }, lines[1]])).not.toBe(
        base
      );
      expect(cartHash([{ ...lines[0], quantity: 3 }, lines[1]])).not.toBe(base);
      expect(
        cartHash([{ ...lines[0], optionIds: ['option-a'] }, lines[1]])
      ).not.toBe(base);
      expect(
        cartHash([{ ...lines[0], unitPrice: '12.51' }, lines[1]])
      ).not.toBe(base);
    });

    it('is a stable hex digest', () => {
      expect(cartHash(lines)).toMatch(/^[a-f0-9]{64}$/);
      expect(cartHash(lines)).toBe(cartHash(lines));
    });
  });

  describe('issueQuote', () => {
    it('mints a 128-bit opaque id and a ten-minute TTL', async () => {
      (prisma.quote.create as jest.Mock).mockResolvedValue({});

      const first = await issueQuote({
        restaurantId,
        lines,
        pricing,
        billRevision: 3,
        promotionIds: ['promo-1'],
        now,
      });
      const second = await issueQuote({
        restaurantId,
        lines,
        pricing,
        billRevision: 3,
        now,
      });

      expect(first.quoteId).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(second.quoteId).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(first.quoteId).not.toBe(second.quoteId);
      expect(first.expiresAt.getTime()).toBe(now.getTime() + QUOTE_TTL_MS);
      expect(QUOTE_TTL_MS).toBe(10 * 60 * 1000);
    });

    it('persists the cart hash, pricing outputs and QuotePromotion rows', async () => {
      (prisma.quote.create as jest.Mock).mockResolvedValue({});

      await issueQuote({
        restaurantId,
        lines,
        pricing,
        billRevision: 3,
        tableId: 'table-1',
        sessionId: 'session-1',
        customerId: 'cust-1',
        phoneHash: 'hash-1',
        promotionIds: ['promo-1', 'promo-1', 'promo-2'],
        now,
      });

      const call = (prisma.quote.create as jest.Mock).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };

      expect(call.data).toMatchObject({
        restaurantId,
        tableId: 'table-1',
        sessionId: 'session-1',
        cartKey: null,
        cartHash: cartHash(lines),
        billRevision: 3,
        customerId: 'cust-1',
        phoneHash: 'hash-1',
        promotionDiscountAmount: '9.00',
        visitState: 'PROMOTION',
        projectedRewardAmount: '0.00',
        rewardLabel: '10% off, max RM15',
        subtotal: '45.00',
        discountAmount: '9.00',
        taxAmount: '2.16',
        serviceCharge: '3.60',
        totalAmount: '41.76',
        projectedTotal: '41.76',
        cashPayable: '41.75',
        issuedAt: now,
        expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
      });
      expect(call.data.quotePromotions).toEqual({
        create: [
          { restaurantId, promotionId: 'promo-1' },
          { restaurantId, promotionId: 'promo-2' },
        ],
      });
    });
  });

  describe('consumeQuote', () => {
    it('consumes a valid quote and marks it in the caller transaction', async () => {
      const { tx, updateMany } = makeTx(quoteFixture());

      const result = await consumeQuote(consumeInput(), tx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.quote.quoteId).toBe('quote-1');
        expect(result.quote.projectedTotal.toString()).toBe('41.76');
        expect(result.quote.cashPayable.toString()).toBe('41.75');
      }
      expect(updateMany).toHaveBeenCalledWith({
        where: { restaurantId, id: 'quote-1', consumedAt: null },
        data: { consumedAt: now, orderId: 'order-1' },
      });
    });

    it('rejects a quote that was already consumed', async () => {
      const { tx, updateMany } = makeTx(
        quoteFixture({ consumedAt: new Date(now.getTime() - 1) })
      );

      const result = await consumeQuote(consumeInput(), tx);

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('rejects a consumed quote even when the conditional update loses the race', async () => {
      const { tx } = makeTx(quoteFixture(), 0);

      const result = await consumeQuote(consumeInput(), tx);

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
    });

    it('rejects an expired quote at the exact expiry boundary', async () => {
      const { tx, updateMany } = makeTx(quoteFixture());

      const result = await consumeQuote(
        consumeInput({ now: new Date(now.getTime() + QUOTE_TTL_MS) }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('accepts one millisecond before expiry', async () => {
      const { tx } = makeTx(quoteFixture());

      const result = await consumeQuote(
        consumeInput({ now: new Date(now.getTime() + QUOTE_TTL_MS - 1) }),
        tx
      );

      expect(result.ok).toBe(true);
    });

    it('rejects a changed cart', async () => {
      const { tx } = makeTx(quoteFixture());

      const result = await consumeQuote(
        consumeInput({ cartHash: 'different-cart' }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
    });

    it('rejects a changed expected total', async () => {
      const { tx } = makeTx(quoteFixture());

      const result = await consumeQuote(
        consumeInput({ expectedTotal: '41.75' }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
    });

    it('rejects a member mismatch', async () => {
      const { tx } = makeTx(quoteFixture({ customerId: 'cust-1' }));

      const result = await consumeQuote(
        consumeInput({ customerId: 'cust-2' }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
    });

    it('rejects a phone-hash mismatch for a phone-bound quote', async () => {
      const { tx } = makeTx(quoteFixture({ phoneHash: 'hash-1' }));

      const result = await consumeQuote(
        consumeInput({ phoneHash: 'hash-2' }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
    });

    it('prefers customerId over phoneHash', async () => {
      const { tx } = makeTx(
        quoteFixture({ customerId: 'cust-1', phoneHash: 'hash-1' })
      );

      const result = await consumeQuote(
        consumeInput({ customerId: 'cust-1', phoneHash: 'hash-2' }),
        tx
      );

      expect(result.ok).toBe(true);
    });

    it('rejects adding a member to a guest quote', async () => {
      const { tx } = makeTx(quoteFixture());

      const result = await consumeQuote(
        consumeInput({ phoneHash: 'hash-1' }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
    });

    it('rejects a quote bound to another session', async () => {
      const { tx } = makeTx(quoteFixture({ sessionId: 'session-1' }));

      const result = await consumeQuote(
        consumeInput({ sessionId: 'session-2' }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
    });

    it('rejects a quote bound to another table', async () => {
      const { tx } = makeTx(quoteFixture({ tableId: 'table-1' }));

      const result = await consumeQuote(
        consumeInput({ tableId: 'table-2' }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
    });

    it('accepts a quote bound to the matching session and table', async () => {
      const { tx } = makeTx(
        quoteFixture({ sessionId: 'session-1', tableId: 'table-1' })
      );

      const result = await consumeQuote(
        consumeInput({ sessionId: 'session-1', tableId: 'table-1' }),
        tx
      );

      expect(result.ok).toBe(true);
    });

    it('rejects a quote that is not in the restaurant', async () => {
      const { tx, findFirst } = makeTx(null);

      const result = await consumeQuote(
        consumeInput({ restaurantId: otherRestaurantId }),
        tx
      );

      expect(result).toMatchObject({
        ok: false,
        loyaltyError: { code: 'QUOTE_CHANGED' },
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: { restaurantId: otherRestaurantId, id: 'quote-1' },
      });
    });
  });

  describe('getQuote', () => {
    const viewRow = {
      id: 'quote-1',
      restaurantId,
      tableId: null,
      sessionId: 'session-1',
      cartKey: null,
      cartHash: 'hash-1',
      billRevision: 3,
      customerId: null,
      phoneHash: null,
      promotionDiscountAmount: '9.00',
      visitState: 'PROMOTION',
      projectedRewardAmount: '0.00',
      rewardLabel: '10% off, max RM15',
      subtotal: '45.00',
      discountAmount: '9.00',
      taxAmount: '2.16',
      serviceCharge: '3.60',
      totalAmount: '41.76',
      projectedTotal: '41.76',
      cashPayable: '41.75',
      issuedAt: now,
      expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
      consumedAt: null,
      orderId: null,
      quotePromotions: [{ promotionId: 'promo-1' }],
    };

    it('reads a quote only for the supplied session binding', async () => {
      (prisma.quote.findFirst as jest.Mock).mockResolvedValue(viewRow);

      const quote = await getQuote({
        restaurantId,
        quoteId: 'quote-1',
        sessionId: 'session-1',
      });

      expect(prisma.quote.findFirst).toHaveBeenCalledWith({
        where: { restaurantId, id: 'quote-1', sessionId: 'session-1' },
        include: { quotePromotions: { select: { promotionId: true } } },
      });
      expect(quote).toMatchObject({
        quoteId: 'quote-1',
        promotionIds: ['promo-1'],
        visitState: 'PROMOTION',
      });
      expect(quote?.projectedTotal.toString()).toBe('41.76');
    });

    it('refuses to read a quote without a session binding', async () => {
      const quote = await getQuote({ restaurantId, quoteId: 'quote-1' });

      expect(quote).toBeNull();
      expect(prisma.quote.findFirst).not.toHaveBeenCalled();
    });

    it('returns null for a cross-tenant or unknown quote', async () => {
      (prisma.quote.findFirst as jest.Mock).mockResolvedValue(null);

      const quote = await getQuote({
        restaurantId: otherRestaurantId,
        quoteId: 'quote-1',
        sessionId: 'session-1',
      });

      expect(quote).toBeNull();
      expect(prisma.quote.findFirst).toHaveBeenCalledWith({
        where: {
          restaurantId: otherRestaurantId,
          id: 'quote-1',
          sessionId: 'session-1',
        },
        include: { quotePromotions: { select: { promotionId: true } } },
      });
    });
  });
});
