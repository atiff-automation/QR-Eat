import Decimal from 'decimal.js';
import { floor2, type MoneyInput } from './money';

export interface RecomputeOrderTotalsInput {
  subtotal: MoneyInput;
  discountAmount: MoneyInput;
  taxRate: MoneyInput;
  serviceRate: MoneyInput;
}

export interface RecomputedOrderTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  discountedSubtotal: Decimal;
  taxAmount: Decimal;
  serviceCharge: Decimal;
  totalAmount: Decimal;
}

/**
 * The taxable subtotal after a discount.
 *
 * The discount is clamped to `[0, subtotal]`, so a malformed discount can never
 * make tax/service negative or make the total exceed the subtotal.
 */
export function taxableBase(
  subtotal: MoneyInput,
  discountAmount: MoneyInput = 0
): Decimal {
  const subtotalDecimal = new Decimal(subtotal);
  const discount = Decimal.max(0, new Decimal(discountAmount));

  return Decimal.max(0, subtotalDecimal.minus(discount));
}

/**
 * Recompute one order's totals after a discount.
 *
 * Semantics are deliberately identical to `calculateOrderTotals` at
 * `discountAmount = 0`: tax and service are each floored to two decimal places
 * on the same base, and the total is the sum of the rounded components.
 *
 * `subtotal` is expected to be non-negative. Negative subtotals are clamped to
 * zero for the discounted base and total, so parity with `calculateOrderTotals`
 * is only guaranteed for non-negative carts.
 */
export function recomputeOrderTotals(
  input: RecomputeOrderTotalsInput
): RecomputedOrderTotals {
  const subtotal = new Decimal(input.subtotal);
  const discountAmount = Decimal.min(
    Decimal.max(0, new Decimal(input.discountAmount)),
    Decimal.max(0, subtotal)
  );
  const discountedSubtotal = taxableBase(subtotal, discountAmount);

  const taxAmount = floor2(discountedSubtotal.times(input.taxRate));
  const serviceCharge = floor2(discountedSubtotal.times(input.serviceRate));
  const totalAmount = discountedSubtotal.plus(taxAmount).plus(serviceCharge);

  return {
    subtotal,
    discountAmount,
    discountedSubtotal,
    taxAmount,
    serviceCharge,
    totalAmount,
  };
}
