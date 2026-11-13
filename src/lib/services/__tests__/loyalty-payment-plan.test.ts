import Decimal from 'decimal.js';
import {
  computeBillPricing,
  type BillOrderRow,
  type BillPricingContext,
  type BillPricingResult,
} from '@/lib/services/loyalty-bill-service';
import {
  buildLoyaltyPaymentPlan,
  buildOfflinePaymentPlan,
  type BuildLoyaltyPaymentPlanInput,
} from '@/lib/services/loyalty-payment-service';
import type {
  PromotionCandidate,
  PromotionLine,
} from '@/lib/loyalty/promotion';
import type { RewardCardSnapshot, RewardRule } from '@/lib/loyalty/reward';

jest.mock('@/lib/database', () => ({ prisma: {} }));

const now = new Date('2026-11-13T10:00:00.000Z');
const businessDate = new Date('2026-11-13T00:00:00.000Z');

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

const member = {
  id: 'cus-1',
  name: 'Aina',
  phone: '+60123456789',
  phoneHash: 'hash-1',
};

function expectLoyaltyError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected LoyaltyPaymentError ${code}`);
}

function context(
  overrides: Partial<BillPricingContext> = {}
): BillPricingContext {
  return {
    settings,
    restaurant: {
      cashRounding: 'NONE',
      timezone: 'Asia/Kuala_Lumpur',
      businessDayCloseTime: '04:00',
    },
    customer: member,
    card: null,
    businessDate,
    alreadyCounted: false,
    ...overrides,
  };
}

function pricing(
  overrides: {
    orders?: BillOrderRow[];
    promotions?: PromotionCandidate[];
    card?: RewardCardSnapshot | null;
    customer?: BillPricingContext['customer'];
    alreadyCounted?: boolean;
    daySubtotal?: string;
    cashRounding?: 'NONE' | 'NEAREST_5_SEN' | null;
    rewardSettings?: RewardRule;
  } = {}
): BillPricingResult {
  return computeBillPricing({
    billRevision: 7,
    orders: overrides.orders ?? [order()],
    promotions: overrides.promotions ?? [],
    settings: overrides.rewardSettings ?? settings,
    card: overrides.card ?? null,
    customer: overrides.customer === undefined ? member : overrides.customer,
    alreadyCounted: overrides.alreadyCounted ?? false,
    daySubtotal: overrides.daySubtotal ?? '60.00',
    cashRounding: overrides.cashRounding ?? 'NONE',
    now,
  });
}

function planInput(
  overrides: Partial<BuildLoyaltyPaymentPlanInput> & {
    pricing?: BillPricingResult;
    context?: BillPricingContext;
    card?: RewardCardSnapshot | null;
  } = {}
): BuildLoyaltyPaymentPlanInput {
  const builtPricing = overrides.pricing ?? pricing();
  const builtContext =
    overrides.context ??
    context({
      card: overrides.card ?? null,
    });

  return {
    pricing: builtPricing,
    context: builtContext,
    method: overrides.method ?? 'card',
    cashReceived: overrides.cashReceived,
    expectedTotal:
      overrides.expectedTotal ?? builtPricing.projection.projectedTotal,
    expectedCashPayable: overrides.expectedCashPayable,
    expectedBillRevision: overrides.expectedBillRevision ?? 7,
    billRevision: overrides.billRevision ?? 7,
    now: overrides.now ?? now,
  };
}

describe('buildLoyaltyPaymentPlan — outcomes', () => {
  it('counts the first visit and creates the card snapshot', () => {
    const built = pricing({ card: null });
    const plan = buildLoyaltyPaymentPlan(planInput({ pricing: built }));

    expect(plan.outcome).toBe('VISIT_COUNTED');
    expect(plan.visitState).toBe('COUNTS');
    expect(plan.visit).toMatchObject({
      customerId: member.id,
      phoneHash: member.phoneHash,
      cycleNumber: 1,
      visitsRequired: 3,
    });
    expect(plan.card).toMatchObject({
      create: true,
      visitsInCycle: 1,
      cycleNumber: 1,
      reset: false,
      rewardApplied: false,
    });
    expect(plan.completedVisits).toBe(1);
    expect(plan.visitsRequired).toBe(3);
    expect(plan.rewardAmount.eq(0)).toBe(true);
    expect(plan.orders[0].discountAmount.eq(0)).toBe(true);
  });

  it('applies the 3rd-visit reward and resets the card', () => {
    const built = pricing({ card: card({ visitsInCycle: 2 }) });
    const plan = buildLoyaltyPaymentPlan(
      planInput({ pricing: built, card: card({ visitsInCycle: 2 }) })
    );

    expect(plan.outcome).toBe('REWARD_APPLIED');
    expect(plan.rewardApplied).toBe(true);
    expect(plan.cardReset).toBe(true);
    expect(plan.card).toMatchObject({
      create: false,
      visitsInCycle: 0,
      cycleNumber: 2,
      reset: true,
      rewardApplied: true,
    });
    expect(plan.completedVisits).toBe(3);
    expect(plan.rewardAmount.toFixed(2)).toBe('6.00');
    expect(plan.orders[0].rewardAllocation.toFixed(2)).toBe('6.00');
    expect(plan.orders[0].discountAmount.toFixed(2)).toBe('6.00');
    expect(plan.rewardSnapshot).toMatchObject({
      cycleNumber: 1,
      visitsRequired: 3,
      rewardValue: '10',
    });
  });

  it('resets the card on a zero-reward completing visit (REVIEW-04 N-2)', () => {
    const zeroReward: RewardRule = {
      ...settings,
      rewardValue: '0.00',
      maxDiscount: '0.00',
    };
    const zeroCard = card({
      visitsInCycle: 2,
      rewardValue: '0.00',
      maxDiscount: '0.00',
    });
    const built = pricing({
      card: zeroCard,
      rewardSettings: zeroReward,
    });
    const plan = buildLoyaltyPaymentPlan(
      planInput({
        pricing: built,
        card: zeroCard,
        context: context({ card: zeroCard }),
      })
    );

    expect(built.projection.projectedRewardAmount).toBe('0.00');
    expect(plan.outcome).toBe('VISIT_COUNTED');
    expect(plan.cardReset).toBe(true);
    expect(plan.rewardApplied).toBe(false);
    expect(plan.card).toMatchObject({
      reset: true,
      visitsInCycle: 0,
      rewardApplied: false,
    });
    expect(plan.rewardAmount.eq(0)).toBe(true);
    expect(plan.rewardSnapshot).toBeNull();
  });

  it('does not count a visit when a promotion applies', () => {
    const built = pricing({
      promotions: [promotion()],
      card: card({ visitsInCycle: 2 }),
    });
    const plan = buildLoyaltyPaymentPlan(
      planInput({
        pricing: built,
        context: context({ card: card({ visitsInCycle: 2 }) }),
      })
    );

    expect(plan.outcome).toBe('PROMOTION_APPLIED');
    expect(plan.visit).toBeNull();
    expect(plan.card).toBeNull();
    expect(plan.cardReset).toBe(false);
    expect(plan.completedVisits).toBe(2);
    expect(plan.rewardAmount.eq(0)).toBe(true);
    expect(plan.orders[0].promotionApplied).toBe(true);
    expect(plan.orders[0].promotionDiscount.toFixed(2)).toBe('12.00');
  });

  it('does not count a second visit on the same day', () => {
    const built = pricing({
      card: card({ visitsInCycle: 2 }),
      alreadyCounted: true,
    });
    const plan = buildLoyaltyPaymentPlan(
      planInput({
        pricing: built,
        context: context({
          card: card({ visitsInCycle: 2 }),
          alreadyCounted: true,
        }),
      })
    );

    expect(plan.outcome).toBe('ALREADY_COUNTED');
    expect(plan.visit).toBeNull();
    expect(plan.card).toBeNull();
  });

  it('does not count a visit below the minimum daily spend', () => {
    const built = pricing({
      card: card({ visitsInCycle: 0 }),
      daySubtotal: '10.00',
    });
    const plan = buildLoyaltyPaymentPlan(
      planInput({
        pricing: built,
        context: context({ card: card({ visitsInCycle: 0 }) }),
      })
    );

    expect(plan.outcome).toBe('BELOW_MINIMUM');
    expect(plan.visit).toBeNull();
    expect(plan.card).toBeNull();
  });

  it('treats a bill without a consented member as guest', () => {
    const built = pricing({ customer: null, card: null });
    const plan = buildLoyaltyPaymentPlan(
      planInput({
        pricing: built,
        context: context({ customer: null, card: null }),
      })
    );

    expect(plan.outcome).toBe('GUEST');
    expect(plan.memberId).toBeNull();
    expect(plan.visit).toBeNull();
    expect(plan.card).toBeNull();
    expect(plan.completedVisits).toBeNull();
    expect(plan.visitsRequired).toBeNull();
  });
});

describe('buildLoyaltyPaymentPlan — money', () => {
  it('rounds cash to the nearest 5 sen and reconciles the drawer', () => {
    const built = pricing({
      promotions: [promotion()],
      cashRounding: 'NEAREST_5_SEN',
    });
    const plan = buildLoyaltyPaymentPlan(
      planInput({
        pricing: built,
        method: 'cash',
        cashReceived: '100.00',
      })
    );

    expect(built.projection.projectedTotal).toBe('55.68');
    expect(plan.cashPayable?.toFixed(2)).toBe('55.70');
    expect(plan.roundingAdjustment?.toFixed(2)).toBe('0.02');
    expect(plan.cashReceived?.toFixed(2)).toBe('100.00');
    expect(plan.changeGiven?.toFixed(2)).toBe('44.30');
    expect(
      plan.cashReceived?.minus(plan.changeGiven ?? 0).eq(plan.cashPayable ?? 0)
    ).toBe(true);
  });

  it('charges card exactly with no cash fields', () => {
    const built = pricing({ promotions: [promotion()] });
    const plan = buildLoyaltyPaymentPlan(
      planInput({ pricing: built, method: 'card' })
    );

    expect(plan.totalAmount.toFixed(2)).toBe('55.68');
    expect(plan.cashPayable).toBeNull();
    expect(plan.roundingAdjustment).toBeNull();
    expect(plan.cashReceived).toBeNull();
    expect(plan.changeGiven).toBeNull();
  });

  it('charges e-wallet exactly with no cash fields', () => {
    const built = pricing({ promotions: [promotion()] });
    const plan = buildLoyaltyPaymentPlan(
      planInput({ pricing: built, method: 'ewallet' })
    );

    expect(plan.totalAmount.toFixed(2)).toBe('55.68');
    expect(plan.cashPayable).toBeNull();
    expect(plan.roundingAdjustment).toBeNull();
    expect(plan.cashReceived).toBeNull();
    expect(plan.changeGiven).toBeNull();
  });

  it('rejects insufficient cash', () => {
    const built = pricing({ promotions: [promotion()] });
    expectLoyaltyError(
      () =>
        buildLoyaltyPaymentPlan(
          planInput({ pricing: built, method: 'cash', cashReceived: '50.00' })
        ),
      'INSUFFICIENT_CASH'
    );
  });

  it('rejects a stale expected total before any write', () => {
    const built = pricing({ promotions: [promotion()] });
    expectLoyaltyError(
      () =>
        buildLoyaltyPaymentPlan(
          planInput({ pricing: built, expectedTotal: '1.00' })
        ),
      'AMOUNT_MISMATCH'
    );
  });

  it('rejects a stale bill revision before any write', () => {
    const built = pricing({ promotions: [promotion()] });
    expectLoyaltyError(
      () =>
        buildLoyaltyPaymentPlan(
          planInput({ pricing: built, expectedBillRevision: 6 })
        ),
      'BILL_CHANGED'
    );
  });

  it('keeps the allocation identities for a multi-order reward bill', () => {
    const built = pricing({
      orders: [
        order({ id: 'order-1', subtotal: '60.00' }),
        order({
          id: 'order-2',
          subtotal: '40.00',
          taxRate: '0.00',
          serviceRate: '0.00',
          lines: [
            {
              itemId: 'item-2',
              categoryId: 'cat-2',
              name: 'Drink',
              lineTotal: '40.00',
            },
          ],
        }),
      ],
      card: card({ visitsInCycle: 2 }),
    });
    const plan = buildLoyaltyPaymentPlan(
      planInput({
        pricing: built,
        context: context({ card: card({ visitsInCycle: 2 }) }),
      })
    );

    const allocated = plan.orders.reduce(
      (sum, entry) => sum.plus(entry.rewardAllocation),
      new Decimal(0)
    );
    const orderTotal = plan.orders.reduce(
      (sum, entry) => sum.plus(entry.totalAmount),
      new Decimal(0)
    );
    const orderDiscount = plan.orders.reduce(
      (sum, entry) => sum.plus(entry.discountAmount),
      new Decimal(0)
    );

    expect(allocated.eq(plan.rewardAmount)).toBe(true);
    expect(orderTotal.eq(plan.totalAmount)).toBe(true);
    expect(orderDiscount.eq(plan.discountAmount)).toBe(true);
    for (const entry of plan.orders) {
      expect(entry.rewardAllocation.lte(entry.subtotal)).toBe(true);
      expect(entry.discountAmount.lte(entry.subtotal)).toBe(true);
    }
  });
});

describe('buildOfflinePaymentPlan', () => {
  const offlineOrder = {
    id: 'order-offline',
    orderNumber: 'OFF-1',
    createdAt: now,
    subtotalAmount: '60.00',
    taxAmount: '3.60',
    serviceCharge: '6.00',
    totalAmount: '69.60',
    offlineCreated: true,
    offlineCreatedAt: now,
    discountVersion: 0,
  };

  it('keeps an offline-created order at full price with no benefit', () => {
    const plan = buildOfflinePaymentPlan({
      orders: [offlineOrder],
      activeDiscounts: [],
      method: 'cash',
      cashReceived: '70.00',
      expectedTotal: '69.60',
      expectedBillRevision: 0,
      billRevision: 0,
      cashRounding: 'NONE',
      offlineCreated: true,
      hasMember: false,
      now,
      businessDate,
      businessDateFallback: false,
    });

    expect(plan.offline).toBe(true);
    expect(plan.outcome).toBe('GUEST');
    expect(plan.visit).toBeNull();
    expect(plan.card).toBeNull();
    expect(plan.rewardAmount.eq(0)).toBe(true);
    expect(plan.totalAmount.toFixed(2)).toBe('69.60');
    expect(plan.orders[0].discountAmount.eq(0)).toBe(true);
    expect(plan.changeGiven?.toFixed(2)).toBe('0.40');
  });

  it('reports NO_BENEFIT for a member bill replayed offline', () => {
    const plan = buildOfflinePaymentPlan({
      orders: [offlineOrder],
      activeDiscounts: [],
      method: 'cash',
      cashReceived: '70.00',
      expectedTotal: '69.60',
      expectedBillRevision: 0,
      billRevision: 0,
      cashRounding: 'NONE',
      offlineCreated: true,
      hasMember: true,
      now,
      businessDate,
      businessDateFallback: false,
    });

    expect(plan.outcome).toBe('NO_BENEFIT');
    expect(plan.visit).toBeNull();
    expect(plan.rewardAmount.eq(0)).toBe(true);
  });

  it('keeps a locked promotion on an online-priced order paid offline', () => {
    const plan = buildOfflinePaymentPlan({
      orders: [
        { ...offlineOrder, offlineCreated: false, totalAmount: '55.68' },
      ],
      activeDiscounts: [
        { orderId: 'order-offline', source: 'PROMOTION', amount: '12.00' },
      ],
      method: 'cash',
      cashReceived: '60.00',
      expectedTotal: '55.68',
      expectedCashPayable: '55.70',
      expectedBillRevision: 0,
      billRevision: 0,
      cashRounding: 'NEAREST_5_SEN',
      offlineCreated: false,
      hasMember: false,
      now,
      businessDate,
      businessDateFallback: true,
    });

    expect(plan.outcome).toBe('PROMOTION_APPLIED');
    expect(plan.visit).toBeNull();
    expect(plan.rewardAmount.eq(0)).toBe(true);
    expect(plan.totalAmount.toFixed(2)).toBe('55.68');
    expect(plan.discountAmount.toFixed(2)).toBe('12.00');
    expect(plan.cashPayable?.toFixed(2)).toBe('55.70');
    expect(plan.businessDateFallback).toBe(true);
  });

  it('reports promotion flags per order on a mixed offline bill', () => {
    // A mixed bill: one online-priced order with a locked promotion and one
    // counter-created order with no ACTIVE row (full price). The bill must not
    // report "no benefit" while an order total already includes a promotion.
    const plan = buildOfflinePaymentPlan({
      orders: [
        {
          ...offlineOrder,
          id: 'online-order',
          offlineCreated: false,
          totalAmount: '55.68',
        },
        {
          ...offlineOrder,
          id: 'counter-order',
          orderNumber: 'CTR-1',
          offlineCreated: false,
          totalAmount: '69.60',
        },
      ],
      activeDiscounts: [
        {
          orderId: 'online-order',
          source: 'PROMOTION',
          sourceId: 'promo-1',
          label: 'Lunch 20%',
          baseAmount: '60.00',
          amount: '12.00',
        },
      ],
      method: 'card',
      expectedTotal: '125.28',
      expectedBillRevision: 0,
      billRevision: 0,
      cashRounding: 'NONE',
      offlineCreated: false,
      hasMember: false,
      now,
      businessDate,
      businessDateFallback: false,
    });

    expect(plan.outcome).toBe('PROMOTION_APPLIED');
    expect(plan.discountAmount.toFixed(2)).toBe('12.00');
    expect(plan.orders[0].promotionApplied).toBe(true);
    expect(plan.orders[0].promotionDiscount.toFixed(2)).toBe('12.00');
    expect(plan.orders[0].discountAmount.toFixed(2)).toBe('12.00');
    expect(plan.orders[1].promotionApplied).toBe(false);
    expect(plan.orders[1].discountAmount.eq(0)).toBe(true);
    expect(plan.totalAmount.toFixed(2)).toBe('125.28');
  });

  it('rejects a replayed projected reward instead of settling it', () => {
    expectLoyaltyError(
      () =>
        buildOfflinePaymentPlan({
          orders: [
            { ...offlineOrder, offlineCreated: false, totalAmount: '55.68' },
          ],
          activeDiscounts: [
            { orderId: 'order-offline', source: 'PROMOTION', amount: '12.00' },
          ],
          method: 'cash',
          cashReceived: '50.00',
          expectedTotal: '49.68',
          billRevision: 0,
          cashRounding: 'NONE',
          offlineCreated: false,
          hasMember: false,
          now,
          businessDate,
          businessDateFallback: false,
        }),
      'AMOUNT_MISMATCH'
    );
  });
});
