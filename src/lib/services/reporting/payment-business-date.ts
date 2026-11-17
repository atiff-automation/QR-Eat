/**
 * Effective business date for a payment (REVIEW-29 B-PAY-2).
 *
 * A payment belongs to the business date of its `PaymentBatch` when it has one.
 * An offline-created order replayed after the cutoff writes the batch on the
 * **offline** date but the payment row on the replay date; ranging only by
 * `Payment.createdAt` would put the sale and its batch in different reports.
 *
 * A payment with no batch — or a pre-migration batch whose `businessDate` is
 * null — falls back to its own `createdAt` through the restaurant clock, which
 * is also the attribution rule for refunds.
 *
 * The Z, the P&L and the loyalty report all use this module so the three
 * reports agree on the sale day.
 */

import type { Prisma } from '@prisma/client';
import {
  getBusinessDate,
  getBusinessDayEnd,
  getBusinessDayStart,
  parseBusinessDateFromDb,
  toDbBusinessDate,
  type BusinessDate,
  type BusinessDayClock,
} from '@/lib/time/business-day';

export interface PaymentBusinessDateSource {
  createdAt: Date;
  batch?: { businessDate: Date | string | null } | null;
}

/**
 * The business date a payment is reported on: its batch `businessDate` when the
 * batch carries one, else `createdAt` through the restaurant clock.
 */
export function paymentBusinessDate(
  payment: PaymentBusinessDateSource,
  clock: BusinessDayClock
): BusinessDate {
  const batchDate = payment.batch?.businessDate;
  if (batchDate) return parseBusinessDateFromDb(batchDate);
  return getBusinessDate(payment.createdAt, clock);
}

/**
 * Prisma filter for the payments attributed to an inclusive business-date
 * range. The SQL mirrors `paymentBusinessDate`:
 *
 * - a batch with a `businessDate` in the range; or
 * - no batch, or a batch with a null `businessDate` (pre-migration), and a
 *   `createdAt` inside the range's opening/closing instants.
 *
 * Callers add their own `order: { restaurantId }` and amount/status filters.
 */
export function paymentBusinessDateRangeWhere(
  from: BusinessDate,
  to: BusinessDate,
  clock: BusinessDayClock
): Prisma.PaymentWhereInput {
  return {
    OR: [
      {
        batch: {
          businessDate: {
            gte: toDbBusinessDate(from),
            lte: toDbBusinessDate(to),
          },
        },
      },
      {
        AND: [
          {
            OR: [{ batchId: null }, { batch: { businessDate: null } }],
          },
          {
            createdAt: {
              gte: getBusinessDayStart(from, clock),
              lt: getBusinessDayEnd(to, clock),
            },
          },
        ],
      },
    ],
  };
}

/** Prisma filter for one business date; the single-day form of the range. */
export function paymentOnBusinessDateWhere(
  businessDate: BusinessDate,
  clock: BusinessDayClock
): Prisma.PaymentWhereInput {
  return paymentBusinessDateRangeWhere(businessDate, businessDate, clock);
}
