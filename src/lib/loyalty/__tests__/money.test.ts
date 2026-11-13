import Decimal from 'decimal.js';
import { floor2, round5, sumMoney, toMoneyString } from '../money';

describe('loyalty money helpers', () => {
  describe('floor2', () => {
    it('floors to two decimal places', () => {
      expect(toMoneyString(floor2('1.999'))).toBe('1.99');
      expect(toMoneyString(floor2('1.991'))).toBe('1.99');
      expect(toMoneyString(floor2('1.99'))).toBe('1.99');
      expect(toMoneyString(floor2(0))).toBe('0.00');
    });

    it('uses ROUND_FLOOR for negative values', () => {
      expect(toMoneyString(floor2('-1.001'))).toBe('-1.01');
    });
  });

  describe('round5', () => {
    it.each([
      ['55.62', '55.60'],
      ['55.63', '55.65'],
      ['55.67', '55.65'],
      ['55.68', '55.70'],
      ['55.72', '55.70'],
      ['55.73', '55.75'],
      ['55.625', '55.65'],
      ['55.675', '55.70'],
      ['0.005', '0.00'],
      ['0.025', '0.05'],
      ['0.075', '0.10'],
      ['0.00', '0.00'],
      ['0.02', '0.00'],
      ['0.03', '0.05'],
    ])('rounds %s to %s', (input, expected) => {
      expect(toMoneyString(round5(input))).toBe(expected);
    });

    it('normalises negative zero', () => {
      const rounded = round5('-0.02');
      expect(rounded.isZero()).toBe(true);
      expect(rounded.isNegative()).toBe(false);
      expect(toMoneyString(rounded)).toBe('0.00');
    });
  });

  describe('toMoneyString', () => {
    it('always renders two decimal places', () => {
      expect(toMoneyString(1.5)).toBe('1.50');
      expect(toMoneyString('10')).toBe('10.00');
      expect(toMoneyString(new Decimal('0.1'))).toBe('0.10');
    });

    it('floors rather than rounds a non-2dp value', () => {
      expect(toMoneyString('1.005')).toBe('1.00');
      expect(toMoneyString('1.009')).toBe('1.00');
      expect(toMoneyString('1.999')).toBe('1.99');
    });

    it('never renders negative zero', () => {
      expect(toMoneyString('-0.00')).toBe('0.00');
      expect(toMoneyString(new Decimal('-0'))).toBe('0.00');
    });
  });

  describe('sumMoney', () => {
    it('sums exactly without floating-point drift', () => {
      expect(toMoneyString(sumMoney([0.1, 0.2]))).toBe('0.30');
      expect(toMoneyString(sumMoney(['1.11', '2.22', '3.33']))).toBe('6.66');
      expect(toMoneyString(sumMoney([]))).toBe('0.00');
    });
  });
});
