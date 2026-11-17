import Decimal from 'decimal.js';
import { toMoneyString } from '../money';
import {
  allocateReward,
  projectReward,
  RewardAllocationError,
  type RewardCardSnapshot,
  type RewardRule,
} from '../reward';

const settings: RewardRule = {
  visitsRequired: 3,
  rewardType: 'PERCENT',
  rewardValue: 10,
  maxDiscount: 15,
  rewardLabel: '10% off, max RM15',
  minDailySpend: 20,
};

const card: RewardCardSnapshot = {
  ...settings,
  visitsInCycle: 2,
  cycleNumber: 1,
};

describe('projectReward', () => {
  it('projects a percent reward on the qualifying visit', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card,
      settings,
      hasPromotion: false,
    });

    expect(projection.applies).toBe(true);
    expect(projection.visitsRequired).toBe(3);
    expect(projection.completedVisits).toBe(2);
    expect(toMoneyString(projection.amount)).toBe('6.00');
    expect(projection.label).toBe('10% off, max RM15');
  });

  it('projects zero when a promotion applies', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card,
      settings,
      hasPromotion: true,
    });

    expect(projection.applies).toBe(false);
    expect(toMoneyString(projection.amount)).toBe('0.00');
  });

  it('caps a percent reward', () => {
    const projection = projectReward({
      subtotal: '200.00',
      card,
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('15.00');
  });

  it('never exceeds the subtotal', () => {
    const projection = projectReward({
      subtotal: '5.00',
      card: {
        ...card,
        rewardType: 'FIXED',
        rewardValue: 50,
        maxDiscount: 100,
      },
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('5.00');
  });

  it('caps a fixed reward by maxDiscount', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: {
        ...card,
        rewardType: 'FIXED',
        rewardValue: 20,
      },
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('15.00');
  });

  it('applies a maxDiscount cap to a fixed reward', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: {
        ...card,
        rewardType: 'FIXED',
        rewardValue: 50,
        maxDiscount: 5,
      },
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('5.00');
  });

  it('caps a fixed reward of 20 at a cap of 5', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: {
        ...card,
        rewardType: 'FIXED',
        rewardValue: 20,
        maxDiscount: 5,
      },
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('5.00');
  });

  it('does not bind a cap above the fixed value', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: {
        ...card,
        rewardType: 'FIXED',
        rewardValue: 5,
        maxDiscount: 20,
      },
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('5.00');
  });

  it('applies the subtotal before the cap', () => {
    const projection = projectReward({
      subtotal: '3.00',
      card: {
        ...card,
        rewardType: 'FIXED',
        rewardValue: 50,
        maxDiscount: 100,
      },
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('3.00');
  });

  it('returns zero and does not apply when the fixed cap is zero', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: {
        ...card,
        rewardType: 'FIXED',
        rewardValue: 50,
        maxDiscount: 0,
      },
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('0.00');
    expect(projection.applies).toBe(false);
  });

  it('keeps a fixed reward at zero when a promotion applies', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: {
        ...card,
        rewardType: 'FIXED',
        rewardValue: 20,
        maxDiscount: 5,
      },
      settings,
      hasPromotion: true,
    });

    expect(toMoneyString(projection.amount)).toBe('0.00');
    expect(projection.applies).toBe(false);
  });

  it('floors a percent reward to two decimal places', () => {
    const projection = projectReward({
      subtotal: '33.33',
      card,
      settings,
      hasPromotion: false,
    });

    expect(toMoneyString(projection.amount)).toBe('3.33');
  });

  it('uses the current settings before the first card exists', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: null,
      settings: {
        ...settings,
        visitsRequired: 2,
      },
      hasPromotion: false,
    });

    // First visit with a 2-visit rule is visit 1 of 2, not a reward visit.
    expect(projection.applies).toBe(false);
    expect(toMoneyString(projection.amount)).toBe('0.00');
  });

  it('does not project a reward for a non-qualifying visit', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: { ...card, visitsInCycle: 1 },
      settings,
      hasPromotion: false,
    });

    expect(projection.applies).toBe(false);
    expect(toMoneyString(projection.amount)).toBe('0.00');
  });

  it('uses the card snapshot instead of the current settings', () => {
    const projection = projectReward({
      subtotal: '60.00',
      card: { ...card, visitsRequired: 5, visitsInCycle: 4 },
      settings: { ...settings, visitsRequired: 2, rewardValue: 50 },
      hasPromotion: false,
    });

    expect(projection.applies).toBe(true);
    expect(projection.visitsRequired).toBe(5);
    expect(toMoneyString(projection.amount)).toBe('6.00');
  });
});

describe('allocateReward', () => {
  it('allocates proportionally to two orders', () => {
    const allocations = allocateReward({
      rewardAmount: '10.00',
      orders: [
        { orderId: 'a', subtotal: '30.00' },
        { orderId: 'b', subtotal: '30.00' },
      ],
    });

    expect(allocations.map((entry) => toMoneyString(entry.amount))).toEqual([
      '5.00',
      '5.00',
    ]);
  });

  it('distributes the remainder to the largest subtotal', () => {
    const allocations = allocateReward({
      rewardAmount: '10.00',
      orders: [
        { orderId: 'a', subtotal: '33.33' },
        { orderId: 'b', subtotal: '33.34' },
        { orderId: 'c', subtotal: '33.33' },
      ],
    });

    expect(allocations.map((entry) => toMoneyString(entry.amount))).toEqual([
      '3.33',
      '3.34',
      '3.33',
    ]);
    expect(
      allocations
        .reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0))
        .toFixed(2)
    ).toBe('10.00');
  });

  it('breaks a remainder tie by order id', () => {
    const allocations = allocateReward({
      rewardAmount: '0.01',
      orders: [
        { orderId: 'c', subtotal: '1.00' },
        { orderId: 'a', subtotal: '1.00' },
        { orderId: 'b', subtotal: '1.00' },
      ],
    });

    expect(allocations).toEqual([
      { orderId: 'c', amount: new Decimal(0) },
      { orderId: 'a', amount: new Decimal('0.01') },
      { orderId: 'b', amount: new Decimal(0) },
    ]);
  });

  it('handles a single order', () => {
    const allocations = allocateReward({
      rewardAmount: '5.00',
      orders: [{ orderId: 'a', subtotal: '10.00' }],
    });

    expect(toMoneyString(allocations[0].amount)).toBe('5.00');
  });

  it('does not allocate to a zero-subtotal order', () => {
    const allocations = allocateReward({
      rewardAmount: '0.01',
      orders: [
        { orderId: 'zero', subtotal: '0.00' },
        { orderId: 'paid', subtotal: '1.00' },
      ],
    });

    expect(allocations).toEqual([
      { orderId: 'zero', amount: new Decimal(0) },
      { orderId: 'paid', amount: new Decimal('0.01') },
    ]);
  });

  it('floors three-decimal order subtotals before allocating', () => {
    const allocations = allocateReward({
      rewardAmount: '10.00',
      orders: [
        { orderId: 'a', subtotal: '10.005' },
        { orderId: 'b', subtotal: '5.005' },
      ],
    });

    expect(allocations.map((entry) => toMoneyString(entry.amount))).toEqual([
      '6.67',
      '3.33',
    ]);
    expect(allocations[0].amount.lte('10.00')).toBe(true);
    expect(allocations[1].amount.lte('5.00')).toBe(true);
  });

  it('floors three-decimal subtotals before choosing the remainder leader', () => {
    const allocations = allocateReward({
      rewardAmount: '0.01',
      orders: [
        { orderId: 'a', subtotal: '0.010' },
        { orderId: 'b', subtotal: '0.011' },
      ],
    });

    expect(allocations.map((entry) => toMoneyString(entry.amount))).toEqual([
      '0.01',
      '0.00',
    ]);

    for (const entry of allocations) {
      expect(entry.amount.decimalPlaces()).toBeLessThanOrEqual(2);
    }

    const total = allocations.reduce(
      (sum, entry) => sum.plus(entry.amount),
      new Decimal(0)
    );
    expect(total.eq('0.01')).toBe(true);
  });

  it('allocates exactly the reward for random bills', () => {
    const random = (() => {
      let seed = 7;
      return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
    })();

    for (let run = 0; run < 50; run += 1) {
      const orderCount = 1 + Math.floor(random() * 3);
      const orders = Array.from({ length: orderCount }, (_, index) => ({
        orderId: `order-${index}`,
        subtotal: (1 + Math.floor(random() * 10000)) / 100,
      }));
      const total = orders.reduce(
        (sum, order) => sum.plus(new Decimal(order.subtotal)),
        new Decimal(0)
      );
      const reward = total
        .times(Math.floor(random() * 100))
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_FLOOR);

      const allocations = allocateReward({
        rewardAmount: reward,
        orders,
      });

      const allocated = allocations.reduce(
        (sum, entry) => sum.plus(entry.amount),
        new Decimal(0)
      );

      expect(allocated.eq(reward)).toBe(true);
      for (const entry of allocations) {
        const order = orders.find((item) => item.orderId === entry.orderId);
        expect(order).toBeDefined();
        expect(entry.amount.lte(order!.subtotal)).toBe(true);
      }
    }
  });

  it('rejects a positive reward on an order with a promotion', () => {
    expect(() =>
      allocateReward({
        rewardAmount: '5.00',
        orders: [
          { orderId: 'a', subtotal: '10.00', hasPromotionDiscount: true },
        ],
      })
    ).toThrow(RewardAllocationError);
  });

  it('rejects a reward larger than the allocatable subtotal', () => {
    expect(() =>
      allocateReward({
        rewardAmount: '11.00',
        orders: [{ orderId: 'a', subtotal: '10.00' }],
      })
    ).toThrow(RewardAllocationError);
  });

  it('rejects a negative reward', () => {
    expect(() =>
      allocateReward({
        rewardAmount: '-1.00',
        orders: [{ orderId: 'a', subtotal: '10.00' }],
      })
    ).toThrow(RewardAllocationError);
  });

  it('returns zero allocations for a zero reward', () => {
    const allocations = allocateReward({
      rewardAmount: '0.00',
      orders: [{ orderId: 'a', subtotal: '10.00', hasPromotionDiscount: true }],
    });

    expect(allocations).toEqual([{ orderId: 'a', amount: new Decimal(0) }]);
  });
});
