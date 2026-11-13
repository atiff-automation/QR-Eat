import Decimal from 'decimal.js';
import {
  computeBillProjection,
  type BillOrderRow,
  type ComputeBillProjectionInput,
} from '@/lib/services/loyalty-bill-service';
import { calculateOrderTotals } from '@/lib/order-utils';
import type {
  PromotionCandidate,
  PromotionLine,
} from '@/lib/loyalty/promotion';
import type { RewardCardSnapshot, RewardRule } from '@/lib/loyalty/reward';

jest.mock('@/lib/database', () => ({ prisma: {} }));

const now = new Date('2026-11-13T10:00:00.000Z');

const settings: RewardRule = {
  visitsRequired: 3,
  rewardType: 'PERCENT',
  rewardValue: '10.00',
  maxDiscount: '15.00',
  rewardLabel: '10% off, max RM15',
  minDailySpend: '20.00',
};

const pastaLine: PromotionLine = {
  itemId: 'item-1',
  categoryId: 'cat-1',
  name: 'Pasta',
  lineTotal: '60.00',
};

const drinkLine: PromotionLine = {
  itemId: 'item-2',
  categoryId: 'cat-2',
  name: 'Drink',
  lineTotal: '40.00',
};

function order(
  overrides: Partial<BillOrderRow> & {
    id?: string;
    subtotal?: string;
    taxRate?: string;
    serviceRate?: string;
    lines?: PromotionLine[];
  } = {}
): BillOrderRow {
  const {
    id = 'order-1',
    subtotal = '60.00',
    taxRate = '0.06',
    serviceRate = '0.10',
    lines = [pastaLine],
    ...rest
  } = overrides;

  return {
    id,
    subtotalAmount: subtotal,
    taxRateSnapshot: taxRate,
    serviceChargeRateSnapshot: serviceRate,
    paymentStatus: 'PENDING',
    status: 'CONFIRMED',
    items: lines.map((line) => ({
      menuItemId: line.itemId,
      totalAmount: line.lineTotal,
      menuItem: {
        name: line.name,
        categoryId: line.categoryId ?? 'cat-1',
      },
    })),
    ...rest,
  };
}

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

function card(overrides: Partial<RewardCardSnapshot> = {}): RewardCardSnapshot {
  return {
    visitsInCycle: 2,
    cycleNumber: 1,
    ...settings,
    ...overrides,
  };
}

function input(
  overrides: Partial<ComputeBillProjectionInput> = {}
): ComputeBillProjectionInput {
  return {
    billRevision: 7,
    orders: [order()],
    promotions: [],
    settings,
    card: null,
    customer: null,
    alreadyCounted: false,
    daySubtotal: '60.00',
    cashRounding: 'NONE',
    now,
    ...overrides,
  };
}

const member = {
  id: 'cus-1',
  name: 'Aina',
  phone: '+60123456789',
};

describe('computeBillProjection — zero-discount parity', () => {
  it('reproduces calculateOrderTotals at zero discount', () => {
    const legacy = calculateOrderTotals([{ totalPrice: 60 }], 0.06, 0.1);
    const projection = computeBillProjection(input());

    expect(projection.subtotal).toBe('60.00');
    expect(new Decimal(projection.taxAmount).toNumber()).toBe(legacy.taxAmount);
    expect(new Decimal(projection.serviceCharge).toNumber()).toBe(
      legacy.serviceCharge
    );
    expect(new Decimal(projection.totalAmount).toNumber()).toBe(
      legacy.totalAmount
    );
    expect(projection.totalAmount).toBe(projection.projectedTotal);
    expect(projection.cashPayable).toBe(projection.projectedTotal);
    expect(projection.fullPriceTotal).toBe(projection.preRewardTotal);
    expect(projection.discountAmount).toBe('0.00');
    expect(projection.promotionApplied).toBe(false);
    expect(projection.visitState).toBe('GUEST');
    expect(projection.member).toBeNull();
    expect(projection.discountSource).toBeNull();
    expect(projection.discountLines).toEqual([]);
    expect(projection.daySubtotal).toBe('60.00');
    expect(projection.amountToMinimum).toBe('0.00');
  });
});

describe('computeBillProjection — promotion', () => {
  it('projects an item promotion with post-discount tax and service', () => {
    const projection = computeBillProjection(
      input({
        promotions: [promotion()],
        card: card(),
        customer: member,
        daySubtotal: '60.00',
        cashRounding: 'NEAREST_5_SEN',
      })
    );

    expect(projection).toEqual({
      billRevision: 7,
      member: {
        id: 'cus-1',
        name: 'Aina',
        maskedPhone: '+60•••••••89',
        completedVisits: 2,
        visitsRequired: 3,
      },
      visitState: 'PROMOTION',
      promotionApplied: true,
      promotionScope: 'ITEM',
      promotionLabel: 'Lunch 20%',
      promotionItems: [{ itemId: 'item-1', name: 'Pasta' }],
      promotionDiscountAmount: '12.00',
      discountAmount: '12.00',
      discountSource: 'PROMOTION',
      discountLabel: 'Lunch 20%',
      discountLines: [
        {
          orderId: 'order-1',
          source: 'PROMOTION',
          label: 'Lunch 20%',
          amount: '12.00',
        },
      ],
      rewardLabel: '10% off, max RM15',
      rewardType: 'PERCENT',
      rewardValue: '10',
      maxDiscount: '15.00',
      subtotal: '60.00',
      taxAmount: '2.88',
      serviceCharge: '4.80',
      fullPriceTotal: '69.60',
      preRewardCashPayable: '55.70',
      projectedRewardAmount: '0.00',
      projectedTotal: '55.68',
      preRewardTotal: '55.68',
      totalAmount: '55.68',
      cashPayable: '55.70',
      daySubtotal: '60.00',
      minDailySpend: '20.00',
      amountToMinimum: '0.00',
    });
  });

  it('returns no promotion items for ORDER scope', () => {
    const projection = computeBillProjection(
      input({
        promotions: [promotion({ scope: 'ORDER', itemIds: [] })],
        customer: member,
        card: card(),
      })
    );

    expect(projection.promotionApplied).toBe(true);
    expect(projection.promotionScope).toBe('ORDER');
    expect(projection.promotionItems).toEqual([]);
  });

  it('marks different promotions on different orders as MULTIPLE', () => {
    const projection = computeBillProjection(
      input({
        orders: [
          order({ id: 'order-1', lines: [pastaLine] }),
          order({
            id: 'order-2',
            subtotal: '40.00',
            lines: [drinkLine],
          }),
        ],
        promotions: [
          promotion({
            id: 'promo-1',
            scope: 'ITEM',
            itemIds: ['item-1'],
            value: '20.00',
          }),
          promotion({
            id: 'promo-2',
            name: 'Drink 10%',
            receiptLabel: 'Drink 10%',
            scope: 'ITEM',
            itemIds: ['item-2'],
            value: '10.00',
          }),
        ],
        customer: member,
        card: card({ visitsInCycle: 0 }),
        daySubtotal: '100.00',
      })
    );

    expect(projection.promotionApplied).toBe(true);
    expect(projection.promotionScope).toBe('MULTIPLE');
    expect(projection.promotionLabel).toBe('Promotions');
    expect(projection.discountLines).toEqual([
      {
        orderId: 'order-1',
        source: 'PROMOTION',
        label: 'Lunch 20%',
        amount: '12.00',
      },
      {
        orderId: 'order-2',
        source: 'PROMOTION',
        label: 'Drink 10%',
        amount: '4.00',
      },
    ]);
    expect(projection.promotionItems).toEqual([
      { itemId: 'item-1', name: 'Pasta' },
      { itemId: 'item-2', name: 'Drink' },
    ]);
    expect(projection.visitState).toBe('PROMOTION');
  });
});

describe('computeBillProjection — reward', () => {
  it('projects the 3rd-visit reward and lowers the projected total', () => {
    const projection = computeBillProjection(
      input({
        card: card(),
        customer: member,
        daySubtotal: '60.00',
      })
    );

    expect(projection.visitState).toBe('COUNTS');
    expect(projection.member).toMatchObject({
      completedVisits: 2,
      visitsRequired: 3,
    });
    expect(projection.projectedRewardAmount).toBe('6.00');
    expect(projection.discountAmount).toBe('6.00');
    expect(projection.discountSource).toBe('LOYALTY_REWARD');
    expect(projection.discountLabel).toBe('10% off, max RM15');
    expect(projection.discountLines).toEqual([
      {
        orderId: 'order-1',
        source: 'LOYALTY_REWARD',
        label: '10% off, max RM15',
        amount: '6.00',
      },
    ]);
    expect(projection.preRewardTotal).toBe('69.60');
    expect(projection.projectedTotal).toBe('62.64');
    expect(projection.totalAmount).toBe('62.64');
    expect(projection.cashPayable).toBe('62.64');
    expect(projection.preRewardCashPayable).toBe('69.60');
    expect(projection.promotionApplied).toBe(false);
  });

  it('allocates a reward per order for a mixed-rate bill', () => {
    const projection = computeBillProjection(
      input({
        orders: [
          order({ id: 'order-1', subtotal: '60.00' }),
          order({
            id: 'order-2',
            subtotal: '40.00',
            taxRate: '0.00',
            serviceRate: '0.00',
            lines: [drinkLine],
          }),
        ],
        card: card(),
        customer: member,
        daySubtotal: '100.00',
      })
    );

    expect(projection.projectedRewardAmount).toBe('10.00');
    expect(projection.discountLines).toEqual([
      {
        orderId: 'order-1',
        source: 'LOYALTY_REWARD',
        label: '10% off, max RM15',
        amount: '6.00',
      },
      {
        orderId: 'order-2',
        source: 'LOYALTY_REWARD',
        label: '10% off, max RM15',
        amount: '4.00',
      },
    ]);
    // Per-order recompute: 54 + 3.24 + 5.40 + 36 = 98.64. A blended
    // recompute would give 104.40.
    expect(projection.taxAmount).toBe('3.24');
    expect(projection.serviceCharge).toBe('5.40');
    expect(projection.projectedTotal).toBe('98.64');
    expect(projection.preRewardTotal).toBe('109.60');
    expect(projection.fullPriceTotal).toBe('109.60');
  });
});

describe('computeBillProjection — visit state precedence', () => {
  it('returns BELOW_MINIMUM and the amount to the minimum', () => {
    const projection = computeBillProjection(
      input({
        card: card({ visitsInCycle: 0 }),
        customer: member,
        daySubtotal: '10.00',
      })
    );

    expect(projection.visitState).toBe('BELOW_MINIMUM');
    expect(projection.amountToMinimum).toBe('10.00');
    expect(projection.projectedRewardAmount).toBe('0.00');
    expect(projection.projectedTotal).toBe('69.60');
  });

  it('returns ALREADY_COUNTED for a member already counted today', () => {
    const projection = computeBillProjection(
      input({
        card: card(),
        customer: member,
        alreadyCounted: true,
      })
    );

    expect(projection.visitState).toBe('ALREADY_COUNTED');
    expect(projection.projectedRewardAmount).toBe('0.00');
  });

  it('keeps a guest bill GUEST even when a promotion applies', () => {
    const projection = computeBillProjection(
      input({
        promotions: [promotion()],
        customer: null,
        card: null,
        daySubtotal: '60.00',
      })
    );

    expect(projection.visitState).toBe('GUEST');
    expect(projection.member).toBeNull();
    expect(projection.promotionApplied).toBe(true);
    expect(projection.promotionDiscountAmount).toBe('12.00');
    expect(projection.amountToMinimum).toBe('0.00');
    expect(projection.daySubtotal).toBe('60.00');
  });
});

describe('computeBillProjection — money identities', () => {
  it('keeps totalAmount == projectedTotal and cashPayable = round5 under NEAREST_5_SEN', () => {
    const projection = computeBillProjection(
      input({
        promotions: [promotion()],
        customer: member,
        card: card(),
        cashRounding: 'NEAREST_5_SEN',
      })
    );

    expect(projection.totalAmount).toBe(projection.projectedTotal);
    expect(projection.cashPayable).toBe('55.70');
    expect(projection.preRewardCashPayable).toBe('55.70');
  });

  it('never exposes the full phone or phoneHash', () => {
    const projection = computeBillProjection(
      input({ customer: member, card: card() })
    );

    expect(projection.member?.maskedPhone).toBe('+60•••••••89');
    expect(projection.member?.maskedPhone).not.toBe(member.phone);
    expect(projection.member).not.toHaveProperty('phone');
    expect(projection.member).not.toHaveProperty('phoneHash');
    expect(JSON.stringify(projection)).not.toContain('+60123456789');
  });

  it('ignores paid and cancelled orders in the bill projection', () => {
    const projection = computeBillProjection(
      input({
        orders: [
          order({ id: 'unpaid', subtotal: '60.00' }),
          order({
            id: 'paid',
            subtotal: '40.00',
            paymentStatus: 'PAID',
          }),
          order({
            id: 'cancelled',
            subtotal: '30.00',
            status: 'CANCELLED',
          }),
        ],
        daySubtotal: '60.00',
      })
    );

    expect(projection.subtotal).toBe('60.00');
  });
});
