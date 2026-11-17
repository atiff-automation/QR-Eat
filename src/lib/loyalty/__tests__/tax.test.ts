import Decimal from 'decimal.js';
import { calculateOrderTotals } from '@/lib/order-utils';
import { toMoneyString, sumMoney } from '../money';
import { recomputeOrderTotals, taxableBase } from '../tax';

function mulberry32(seed: number): () => number {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

describe('recomputeOrderTotals', () => {
  it('is bit-identical to calculateOrderTotals at zero discount', () => {
    const random = mulberry32(20261113);
    const taxRates = [0, 0.05, 0.06, 0.08, 0.1, 0.13, 0.15, 0.17];
    const serviceRates = [0, 0.05, 0.1, 0.12];

    for (let cart = 0; cart < 100; cart += 1) {
      const itemCount = 1 + Math.floor(random() * 8);
      const items = Array.from({ length: itemCount }, () => ({
        totalPrice: round2(0.01 + random() * 99.99),
      }));
      const taxRate = taxRates[Math.floor(random() * taxRates.length)];
      const serviceRate =
        serviceRates[Math.floor(random() * serviceRates.length)];

      const expected = calculateOrderTotals(items, taxRate, serviceRate);
      const result = recomputeOrderTotals({
        subtotal: sumMoney(items.map((item) => item.totalPrice)),
        discountAmount: 0,
        taxRate,
        serviceRate,
      });

      expect(result.subtotal.toNumber()).toBe(expected.subtotal);
      expect(result.discountedSubtotal.toNumber()).toBe(expected.subtotal);
      expect(result.taxAmount.toNumber()).toBe(expected.taxAmount);
      expect(result.serviceCharge.toNumber()).toBe(expected.serviceCharge);
      expect(result.totalAmount.toNumber()).toBe(expected.totalAmount);

      expect(toMoneyString(result.subtotal)).toBe(
        new Decimal(expected.subtotal).toFixed(2)
      );
      expect(toMoneyString(result.taxAmount)).toBe(
        new Decimal(expected.taxAmount).toFixed(2)
      );
      expect(toMoneyString(result.serviceCharge)).toBe(
        new Decimal(expected.serviceCharge).toFixed(2)
      );
      expect(toMoneyString(result.totalAmount)).toBe(
        new Decimal(expected.totalAmount).toFixed(2)
      );
    }
  });

  it('recomputes tax and service on the discounted subtotal', () => {
    const result = recomputeOrderTotals({
      subtotal: '60.00',
      discountAmount: '12.00',
      taxRate: 0.06,
      serviceRate: 0.1,
    });

    expect(toMoneyString(result.discountedSubtotal)).toBe('48.00');
    expect(toMoneyString(result.taxAmount)).toBe('2.88');
    expect(toMoneyString(result.serviceCharge)).toBe('4.80');
    expect(toMoneyString(result.totalAmount)).toBe('55.68');
  });

  it('floors each component separately', () => {
    const result = recomputeOrderTotals({
      subtotal: '10.00',
      discountAmount: '3.33',
      taxRate: 0.0666,
      serviceRate: 0.0333,
    });

    expect(toMoneyString(result.discountedSubtotal)).toBe('6.67');
    expect(toMoneyString(result.taxAmount)).toBe('0.44');
    expect(toMoneyString(result.serviceCharge)).toBe('0.22');
    expect(toMoneyString(result.totalAmount)).toBe('7.33');
  });

  it('clamps a discount to the subtotal', () => {
    const result = recomputeOrderTotals({
      subtotal: '10.00',
      discountAmount: '15.00',
      taxRate: 0.06,
      serviceRate: 0.1,
    });

    expect(toMoneyString(result.discountAmount)).toBe('10.00');
    expect(toMoneyString(result.discountedSubtotal)).toBe('0.00');
    expect(toMoneyString(result.taxAmount)).toBe('0.00');
    expect(toMoneyString(result.serviceCharge)).toBe('0.00');
    expect(toMoneyString(result.totalAmount)).toBe('0.00');
  });

  it('clamps a negative discount to zero', () => {
    const result = recomputeOrderTotals({
      subtotal: '10.00',
      discountAmount: '-5.00',
      taxRate: 0.06,
      serviceRate: 0.1,
    });

    expect(toMoneyString(result.discountAmount)).toBe('0.00');
    expect(toMoneyString(result.totalAmount)).toBe('11.60');
  });

  it('clamps a negative subtotal to zero for the discounted base', () => {
    const result = recomputeOrderTotals({
      subtotal: '-10.00',
      discountAmount: 0,
      taxRate: 0.06,
      serviceRate: 0.1,
    });

    expect(toMoneyString(result.subtotal)).toBe('-10.00');
    expect(toMoneyString(result.discountedSubtotal)).toBe('0.00');
    expect(toMoneyString(result.taxAmount)).toBe('0.00');
    expect(toMoneyString(result.serviceCharge)).toBe('0.00');
    expect(toMoneyString(result.totalAmount)).toBe('0.00');
  });
});

describe('taxableBase', () => {
  it('returns the discounted subtotal', () => {
    expect(toMoneyString(taxableBase('60.00', '12.00'))).toBe('48.00');
    expect(toMoneyString(taxableBase('60.00'))).toBe('60.00');
  });

  it('never returns a negative base', () => {
    expect(toMoneyString(taxableBase('10.00', '12.00'))).toBe('0.00');
    expect(toMoneyString(taxableBase('10.00', '-2.00'))).toBe('10.00');
  });
});
