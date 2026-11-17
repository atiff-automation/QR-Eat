import Decimal from 'decimal.js';

/**
 * A monetary value accepted at the pricing boundary.
 *
 * Arithmetic always converts to `Decimal` first. `number` is accepted only
 * because existing call sites (for example `calculateOrderTotals`) already hold
 * numeric item totals; it is never used for accumulation.
 */
export type MoneyInput = Decimal.Value;

const FIVE_SEN = new Decimal('0.05');

/** Floor a money value to two decimal places, matching `calculateOrderTotals`. */
export function floor2(value: MoneyInput): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_FLOOR);
}

/**
 * Round a money value to the nearest five sen (RM0.05).
 *
 * Used for cash payable only. Half-way values (`.005` of a ringgit) round away
 * from zero, matching the usual "nearest 5 sen" rule. Negative zero is
 * normalised to `0`.
 */
export function round5(value: MoneyInput): Decimal {
  const amount = new Decimal(value);
  const rounded = amount
    .dividedBy(FIVE_SEN)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .times(FIVE_SEN);

  return rounded.isZero() ? new Decimal(0) : rounded;
}

/** Format a money value as a two-decimal string for the API boundary. */
export function toMoneyString(value: MoneyInput): string {
  const amount = new Decimal(value);
  if (amount.isZero()) return '0.00';
  return floor2(amount).toFixed(2);
}

/** Sum money values exactly, without floating-point accumulation. */
export function sumMoney(values: readonly MoneyInput[]): Decimal {
  return values.reduce<Decimal>(
    (sum, value) => sum.plus(new Decimal(value)),
    new Decimal(0)
  );
}
