import { toMoneyString } from '../money';
import {
  evaluatePromotion,
  type PromotionCandidate,
  type PromotionLine,
} from '../promotion';

const AT = new Date('2026-06-01T12:00:00.000Z');

function line(
  itemId: string,
  categoryId: string | null,
  lineTotal: string,
  name = itemId
): PromotionLine {
  return { itemId, categoryId, lineTotal, name };
}

function promotion(
  overrides: Partial<PromotionCandidate> = {}
): PromotionCandidate {
  return {
    id: 'promo-1',
    name: 'Lunch offer',
    receiptLabel: 'Lunch offer',
    type: 'PERCENT',
    value: 10,
    scope: 'ORDER',
    categoryIds: [],
    itemIds: [],
    minSpend: 0,
    maxDiscount: 1000,
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: new Date('2027-01-01T00:00:00.000Z'),
    isActive: true,
    ...overrides,
  };
}

function evaluate(lines: PromotionLine[], promotions: PromotionCandidate[]) {
  return evaluatePromotion({ lines, promotions, at: AT });
}

describe('evaluatePromotion', () => {
  describe('ORDER scope', () => {
    it('applies a percent discount to the whole order subtotal', () => {
      const result = evaluate(
        [line('pasta', 'mains', '20.00'), line('soup', 'starters', '40.00')],
        [promotion({ type: 'PERCENT', value: 20, maxDiscount: 100 })]
      );

      expect(result.applied).toBe(true);
      expect(result.scope).toBe('ORDER');
      expect(result.promotionId).toBe('promo-1');
      expect(result.label).toBe('Lunch offer');
      expect(toMoneyString(result.eligibleBase)).toBe('60.00');
      expect(toMoneyString(result.discountAmount)).toBe('12.00');
      expect(result.items).toEqual([]);
      expect(result.partialOrder).toBe(false);
    });

    it('caps a percent discount', () => {
      const result = evaluate(
        [line('pasta', 'mains', '60.00')],
        [promotion({ type: 'PERCENT', value: 20, maxDiscount: 10 })]
      );

      expect(toMoneyString(result.discountAmount)).toBe('10.00');
    });

    it('clamps a percent discount to the eligible base', () => {
      const result = evaluate(
        [line('pasta', 'mains', '60.00')],
        [promotion({ type: 'PERCENT', value: 150, maxDiscount: 1000 })]
      );

      expect(toMoneyString(result.eligibleBase)).toBe('60.00');
      expect(toMoneyString(result.discountAmount)).toBe('60.00');
      expect(result.discountAmount.lte(result.eligibleBase)).toBe(true);
    });

    it('floors a three-decimal eligible base and discount to two decimals', () => {
      const result = evaluate(
        [line('pasta', 'mains', '60.009')],
        [promotion({ type: 'PERCENT', value: 150, maxDiscount: 1000 })]
      );

      expect(result.eligibleBase.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(result.discountAmount.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(toMoneyString(result.eligibleBase)).toBe('60.00');
      expect(toMoneyString(result.discountAmount)).toBe('60.00');
      expect(result.discountAmount.lte(result.eligibleBase)).toBe(true);

      const tiny = evaluate(
        [line('tiny', 'mains', '0.019')],
        [promotion({ type: 'PERCENT', value: 150, maxDiscount: 1000 })]
      );

      expect(tiny.eligibleBase.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(tiny.discountAmount.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(toMoneyString(tiny.eligibleBase)).toBe('0.01');
      expect(toMoneyString(tiny.discountAmount)).toBe('0.01');
      expect(tiny.discountAmount.lte(tiny.eligibleBase)).toBe(true);
    });

    it('uses min(value, base) for a fixed discount', () => {
      const result = evaluate(
        [line('pasta', 'mains', '60.00')],
        [promotion({ type: 'FIXED', value: 20, maxDiscount: 1000 })]
      );

      expect(toMoneyString(result.discountAmount)).toBe('20.00');

      const aboveBase = evaluate(
        [line('pasta', 'mains', '60.00')],
        [promotion({ type: 'FIXED', value: 100, maxDiscount: 1000 })]
      );

      expect(toMoneyString(aboveBase.eligibleBase)).toBe('60.00');
      expect(toMoneyString(aboveBase.discountAmount)).toBe('60.00');
    });

    it('caps a fixed discount by maxDiscount', () => {
      const result = evaluate(
        [line('pasta', 'mains', '60.00')],
        [promotion({ type: 'FIXED', value: 20, maxDiscount: 15 })]
      );

      expect(toMoneyString(result.discountAmount)).toBe('15.00');
    });
  });

  describe('CATEGORY scope', () => {
    it('uses only lines in the selected categories', () => {
      const result = evaluate(
        [
          line('pasta', 'mains', '20.00', 'Pasta'),
          line('soup', 'starters', '40.00', 'Soup'),
        ],
        [
          promotion({
            scope: 'CATEGORY',
            categoryIds: ['mains'],
            type: 'PERCENT',
            value: 10,
          }),
        ]
      );

      expect(result.applied).toBe(true);
      expect(result.scope).toBe('CATEGORY');
      expect(toMoneyString(result.eligibleBase)).toBe('20.00');
      expect(toMoneyString(result.discountAmount)).toBe('2.00');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        itemId: 'pasta',
        name: 'Pasta',
      });
      expect(result.partialOrder).toBe(true);
    });

    it('checks minSpend against the eligible category base, not the order', () => {
      const result = evaluate(
        [line('pasta', 'mains', '20.00'), line('soup', 'starters', '80.00')],
        [
          promotion({
            scope: 'CATEGORY',
            categoryIds: ['mains'],
            type: 'PERCENT',
            value: 10,
            minSpend: 30,
          }),
        ]
      );

      expect(result.applied).toBe(false);
      expect(toMoneyString(result.discountAmount)).toBe('0.00');
    });

    it('does not apply when no category line is in the order', () => {
      const result = evaluate(
        [line('soup', 'starters', '80.00')],
        [
          promotion({
            scope: 'CATEGORY',
            categoryIds: ['mains'],
            type: 'PERCENT',
            value: 10,
          }),
        ]
      );

      expect(result.applied).toBe(false);
      expect(result.items).toEqual([]);
    });
  });

  describe('ITEM scope', () => {
    it('uses only the selected items and reports partial order', () => {
      const result = evaluate(
        [
          line('pasta', 'mains', '15.00', 'Pasta'),
          line('soup', 'starters', '45.00', 'Soup'),
        ],
        [
          promotion({
            scope: 'ITEM',
            itemIds: ['pasta'],
            type: 'PERCENT',
            value: 10,
          }),
        ]
      );

      expect(result.applied).toBe(true);
      expect(result.scope).toBe('ITEM');
      expect(toMoneyString(result.eligibleBase)).toBe('15.00');
      expect(toMoneyString(result.discountAmount)).toBe('1.50');
      expect(result.items.map((item) => item.name)).toEqual(['Pasta']);
      expect(result.partialOrder).toBe(true);
    });

    it('does not apply when no item is in the order', () => {
      const result = evaluate(
        [line('soup', 'starters', '45.00')],
        [
          promotion({
            scope: 'ITEM',
            itemIds: ['pasta'],
            type: 'PERCENT',
            value: 10,
          }),
        ]
      );

      expect(result.applied).toBe(false);
      expect(result.scope).toBeNull();
      expect(toMoneyString(result.eligibleBase)).toBe('0.00');
      expect(toMoneyString(result.discountAmount)).toBe('0.00');
      expect(result.items).toEqual([]);
    });
  });

  describe('application conditions', () => {
    it('does not apply when the eligible base is zero', () => {
      const result = evaluate(
        [line('pasta', 'mains', '0.00')],
        [promotion({ type: 'PERCENT', value: 10 })]
      );

      expect(result.applied).toBe(false);
    });

    it('applies minSpend at the boundary and rejects just above it', () => {
      const lines = [line('pasta', 'mains', '60.00')];

      const justBelow = evaluate(lines, [promotion({ minSpend: '59.99' })]);
      const exactly = evaluate(lines, [promotion({ minSpend: '60.00' })]);
      const above = evaluate(lines, [promotion({ minSpend: '60.01' })]);

      expect(justBelow.applied).toBe(true);
      expect(exactly.applied).toBe(true);
      expect(above.applied).toBe(false);
    });

    it('does not apply when the discount is zero', () => {
      const zeroPercent = evaluate(
        [line('pasta', 'mains', '60.00')],
        [promotion({ type: 'PERCENT', value: 0 })]
      );
      const zeroCap = evaluate(
        [line('pasta', 'mains', '60.00')],
        [promotion({ type: 'PERCENT', value: 10, maxDiscount: 0 })]
      );

      expect(zeroPercent.applied).toBe(false);
      expect(zeroCap.applied).toBe(false);
    });

    it('ignores inactive and out-of-window promotions', () => {
      const lines = [line('pasta', 'mains', '60.00')];

      expect(evaluate(lines, [promotion({ isActive: false })]).applied).toBe(
        false
      );
      expect(
        evaluate(lines, [
          promotion({ startsAt: new Date('2026-07-01T00:00:00.000Z') }),
        ]).applied
      ).toBe(false);
      expect(
        evaluate(lines, [
          promotion({ endsAt: new Date('2026-05-01T00:00:00.000Z') }),
        ]).applied
      ).toBe(false);
    });
  });

  describe('best single', () => {
    it('chooses the highest discount and does not stack', () => {
      const result = evaluate(
        [line('pasta', 'mains', '60.00')],
        [
          promotion({ id: 'a', type: 'PERCENT', value: 10 }),
          promotion({ id: 'b', type: 'FIXED', value: 8 }),
        ]
      );

      expect(result.promotionId).toBe('b');
      expect(toMoneyString(result.discountAmount)).toBe('8.00');
    });

    it('breaks a discount tie by the lowest promotion id', () => {
      const result = evaluate(
        [line('pasta', 'mains', '60.00')],
        [
          promotion({ id: 'promo-b', type: 'FIXED', value: 6 }),
          promotion({ id: 'promo-a', type: 'FIXED', value: 6 }),
        ]
      );

      expect(result.promotionId).toBe('promo-a');
      expect(toMoneyString(result.discountAmount)).toBe('6.00');
    });

    it('skips ineligible candidates when choosing the best', () => {
      const result = evaluate(
        [line('pasta', 'mains', '60.00')],
        [
          promotion({
            id: 'promo-a',
            type: 'FIXED',
            value: 20,
            minSpend: 100,
          }),
          promotion({ id: 'promo-b', type: 'FIXED', value: 5 }),
        ]
      );

      expect(result.promotionId).toBe('promo-b');
      expect(toMoneyString(result.discountAmount)).toBe('5.00');
    });
  });
});
