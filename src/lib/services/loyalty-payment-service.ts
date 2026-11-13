/**
 * Loyalty-aware Counter and takeaway payment.
 *
 * This is the R3 money path. The route stays thin; this module owns the
 * projection validation, the lock order (customer/day → bill/order), and the
 * single transaction that writes the batch, visit, card, discount ledger,
 * payments and the `PAYMENT` idempotency record (§18.20.6, §18.20.10,
 * §18.20.14 E/F/H/I, §18.20.15 C/D).
 *
 * Rules enforced here:
 * - validate `expectedTotal`/`expectedCashPayable`/`expectedBillRevision`
 *   before any write; divergence is `BILL_CHANGED`/`AMOUNT_MISMATCH`;
 * - a promotion on the paid bill means no visit, no card change, no reset;
 * - no promotion and a qualifying day writes the visit; reaching
 *   `visitsRequired` applies the reward and resets the card. The reset is driven
 *   by `nextCardState`, never by `reward.applies` (REVIEW-04 N-2);
 * - the reward ledger is proportional to order subtotal with the remainder by
 *   subtotal desc then order id, and the money identities are asserted;
 * - cash is `round5(projectedTotal)`, card/e-wallet are exact;
 * - offline replay adds no benefit and never removes an ACTIVE discount.
 *
 * Money uses `decimal.js` only. No phone number is ever logged or returned.
 */

import { createHash, randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { Prisma, PaymentOutcome } from '@prisma/client';
import { prisma, type TransactionClient } from '@/lib/database';
import { SequenceManager } from '@/lib/sequence-manager';
import { recordRestaurantChange } from '@/lib/restaurant-changes';
import { formatPickupNumber } from '@/lib/order-utils';
import {
  round5,
  sumMoney,
  toMoneyString,
  type MoneyInput,
} from '@/lib/loyalty/money';
import {
  nextCardState,
  resolveVisitOutcome,
  type LoyaltyOutcome,
  type VisitState,
} from '@/lib/loyalty/visit';
import type { RewardRule } from '@/lib/loyalty/reward';
import type { PromotionCandidate } from '@/lib/loyalty/promotion';
import {
  BILL_ORDER_SELECT,
  projectBillPricing,
  type BillActiveDiscount,
  type BillActiveDiscountSnapshot,
  type BillPricingContext,
  type BillPricingResult,
} from '@/lib/services/loyalty-bill-service';
import { getBusinessDate, toDbBusinessDate } from '@/lib/time/business-day';

export type LoyaltyPaymentMethod = 'cash' | 'card' | 'ewallet';

export class LoyaltyPaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 409
  ) {
    super(message);
    this.name = 'LoyaltyPaymentError';
  }
}

export interface LoyaltyPaymentExpectations {
  /** The `projectedTotal` the cashier saw. */
  expectedTotal?: MoneyInput;
  /** Cash only: the `cashPayable` the cashier saw. */
  expectedCashPayable?: MoneyInput;
  /** The `billRevision` the cashier saw. */
  expectedBillRevision?: number;
}

export interface LoyaltyPaymentBaseInput extends LoyaltyPaymentExpectations {
  restaurantId: string;
  userId: string;
  userType: string;
  idempotencyKey: string;
  paymentMethod: LoyaltyPaymentMethod;
  cashReceived?: MoneyInput;
  externalTransactionId?: string;
  notes?: string;
  /** True when the Counter is replaying a payment captured offline. */
  recordedOffline?: boolean;
  now?: Date;
}

export interface LoyaltyTablePaymentInput extends LoyaltyPaymentBaseInput {
  tableId: string;
  orderIds?: string[];
}

export interface LoyaltyOrderPaymentInput extends LoyaltyPaymentBaseInput {
  orderId: string;
}

export interface LoyaltyPaymentResult {
  replayed: boolean;
  response: Record<string, unknown>;
}

// ============================================================================
// Payment plan (pure)
// ============================================================================

export interface LoyaltyPaymentPlanOrder {
  orderId: string;
  subtotal: Decimal;
  promotionApplied: boolean;
  promotionId: string | null;
  promotion: PromotionCandidate | null;
  promotionLabel: string | null;
  eligibleBase: Decimal;
  promotionDiscount: Decimal;
  rewardAllocation: Decimal;
  discountAmount: Decimal;
  discountSource: 'PROMOTION' | 'LOYALTY_REWARD' | null;
  discountLabel: string | null;
  preRewardTotal: Decimal;
  taxAmount: Decimal;
  serviceCharge: Decimal;
  totalAmount: Decimal;
}

export interface LoyaltyPaymentPlanRewardSnapshot {
  label: string;
  rewardType: 'PERCENT' | 'FIXED';
  rewardValue: string;
  maxDiscount: string;
  cycleNumber: number;
  visitsRequired: number;
}

export interface LoyaltyPaymentPlan {
  offline: boolean;
  businessDate: Date;
  businessDateFallback: boolean;
  outcome: LoyaltyOutcome;
  visitState: VisitState;
  totalAmount: Decimal;
  discountAmount: Decimal;
  promotionDiscountAmount: Decimal;
  rewardAmount: Decimal;
  orders: LoyaltyPaymentPlanOrder[];
  visit: {
    customerId: string;
    phoneHash: string;
    cycleNumber: number;
    visitsRequired: number;
  } | null;
  card: {
    create: boolean;
    visitsInCycle: number;
    cycleNumber: number;
    reset: boolean;
    rewardApplied: boolean;
    snapshot: RewardRule;
  } | null;
  rewardSnapshot: LoyaltyPaymentPlanRewardSnapshot | null;
  cashPayable: Decimal | null;
  roundingAdjustment: Decimal | null;
  cashReceived: Decimal | null;
  changeGiven: Decimal | null;
  completedVisits: number | null;
  visitsRequired: number | null;
  cardReset: boolean;
  rewardApplied: boolean;
  memberId: string | null;
}

function money(value: MoneyInput | null | undefined): Decimal | null {
  if (value === undefined || value === null) return null;
  return new Decimal(value);
}

function cashFigures(input: {
  method: LoyaltyPaymentMethod;
  totalAmount: Decimal;
  cashPayable: Decimal;
  cashReceived?: MoneyInput;
  expectedCashPayable?: MoneyInput;
}): {
  cashPayable: Decimal | null;
  roundingAdjustment: Decimal | null;
  cashReceived: Decimal | null;
  changeGiven: Decimal | null;
} {
  if (input.method !== 'cash') {
    // Card and e-wallet charge `projectedTotal` exactly to 2dp.
    return {
      cashPayable: null,
      roundingAdjustment: null,
      cashReceived: null,
      changeGiven: null,
    };
  }

  const expectedCash = money(input.expectedCashPayable);
  if (expectedCash && !expectedCash.eq(input.cashPayable)) {
    throw new LoyaltyPaymentError(
      'The cash total changed. Reload the bill before taking payment.',
      'AMOUNT_MISMATCH',
      409
    );
  }

  const cashReceived = money(input.cashReceived) ?? input.cashPayable;
  if (cashReceived.lt(input.cashPayable)) {
    throw new LoyaltyPaymentError(
      'Insufficient cash received.',
      'INSUFFICIENT_CASH',
      400
    );
  }

  const roundingAdjustment = input.cashPayable.minus(input.totalAmount);
  if (roundingAdjustment.abs().gt(new Decimal('0.02'))) {
    throw new LoyaltyPaymentError(
      'Cash rounding is outside the allowed range.',
      'CASH_ROUNDING_FAILED',
      409
    );
  }

  return {
    cashPayable: input.cashPayable,
    roundingAdjustment,
    cashReceived,
    changeGiven: cashReceived.minus(input.cashPayable),
  };
}

export interface BuildLoyaltyPaymentPlanInput {
  pricing: BillPricingResult;
  context: BillPricingContext;
  method: LoyaltyPaymentMethod;
  cashReceived?: MoneyInput;
  expectedTotal?: MoneyInput;
  expectedCashPayable?: MoneyInput;
  expectedBillRevision?: number;
  billRevision: number;
  now: Date;
}

/**
 * Pure payment decision. No I/O. Callers must already hold the customer/day
 * and bill/order locks and pass the projection computed under them.
 */
export function buildLoyaltyPaymentPlan(
  input: BuildLoyaltyPaymentPlanInput
): LoyaltyPaymentPlan {
  const projection = input.pricing.projection;
  const rule = input.pricing.rule;

  if (
    input.expectedBillRevision !== undefined &&
    input.expectedBillRevision !== input.billRevision
  ) {
    throw new LoyaltyPaymentError(
      'The bill changed. Reload the bill before taking payment.',
      'BILL_CHANGED',
      409
    );
  }

  const totalAmount = new Decimal(projection.projectedTotal);
  const expectedTotal = money(input.expectedTotal);
  if (expectedTotal && !expectedTotal.eq(totalAmount)) {
    throw new LoyaltyPaymentError(
      'The bill total changed. Reload the bill before taking payment.',
      'AMOUNT_MISMATCH',
      409
    );
  }

  const cash = cashFigures({
    method: input.method,
    totalAmount,
    cashPayable: new Decimal(projection.cashPayable),
    cashReceived: input.cashReceived,
    expectedCashPayable: input.expectedCashPayable,
  });

  const member = input.context.customer;
  const hasMember = member !== null;
  const resolved = resolveVisitOutcome({
    hasMember,
    hasConsent: hasMember,
    hasPromotion: projection.promotionApplied,
    rewardApplied: new Decimal(projection.projectedRewardAmount).gt(0),
    alreadyCounted: input.context.alreadyCounted,
    daySubtotal: projection.daySubtotal,
    minDailySpend: rule.minDailySpend,
  });

  const rewardAmount = new Decimal(projection.projectedRewardAmount);
  let visit: LoyaltyPaymentPlan['visit'] = null;
  let card: LoyaltyPaymentPlan['card'] = null;
  let rewardSnapshot: LoyaltyPaymentPlanRewardSnapshot | null = null;
  let completedVisits: number | null = null;
  let visitsRequired: number | null = null;
  let cardReset = false;
  let rewardApplied = false;
  let outcome: LoyaltyOutcome = resolved.outcome;

  if (hasMember) {
    visitsRequired = rule.visitsRequired;
    completedVisits = input.context.card?.visitsInCycle ?? 0;
  }

  if (resolved.visitState === 'COUNTS' && member) {
    const previousVisits = input.context.card?.visitsInCycle ?? 0;
    const cycleNumber = input.context.card?.cycleNumber ?? 1;
    const next = nextCardState({
      visitsInCycle: previousVisits,
      visitsRequired: rule.visitsRequired,
    });

    // The reset is driven by the visit completing the cycle, not by the reward
    // amount. A zero-reward completing visit still resets (REVIEW-04 N-2).
    cardReset = next.resets;
    rewardApplied = next.rewardApplies && rewardAmount.gt(0);
    outcome = rewardApplied ? 'REWARD_APPLIED' : 'VISIT_COUNTED';
    completedVisits = next.resets ? rule.visitsRequired : previousVisits + 1;

    visit = {
      customerId: member.id,
      phoneHash: member.phoneHash,
      cycleNumber,
      visitsRequired: rule.visitsRequired,
    };
    card = {
      create: input.context.card === null,
      visitsInCycle: next.resets ? 0 : previousVisits + 1,
      cycleNumber: next.resets ? cycleNumber + 1 : cycleNumber,
      reset: next.resets,
      rewardApplied,
      snapshot: rule,
    };

    if (rewardApplied) {
      rewardSnapshot = {
        label: input.pricing.reward.label,
        rewardType: input.pricing.reward.rewardType,
        rewardValue:
          input.pricing.reward.rewardType === 'PERCENT'
            ? new Decimal(input.pricing.reward.rewardValue).toFixed(0)
            : toMoneyString(input.pricing.reward.rewardValue),
        maxDiscount: toMoneyString(input.pricing.reward.maxDiscount),
        cycleNumber,
        visitsRequired: rule.visitsRequired,
      };
    }
  }

  const orders: LoyaltyPaymentPlanOrder[] = input.pricing.orders.map(
    (entry) => {
      if (entry.promotionApplied && entry.rewardAllocation.gt(0)) {
        throw new LoyaltyPaymentError(
          'A promotion and a loyalty reward cannot coexist on one order.',
          'DISCOUNT_ALLOCATION_FAILED',
          409
        );
      }
      const discountAmount = entry.promotionDiscount.plus(
        entry.rewardAllocation
      );
      const discountSource = entry.promotionApplied
        ? ('PROMOTION' as const)
        : entry.rewardAllocation.gt(0)
          ? ('LOYALTY_REWARD' as const)
          : null;

      return {
        orderId: entry.orderId,
        subtotal: entry.preRewardTotals.subtotal,
        promotionApplied: entry.promotionApplied,
        promotionId: entry.promotionId,
        promotion: entry.promotion,
        promotionLabel: entry.promotionLabel,
        eligibleBase: entry.eligibleBase,
        promotionDiscount: entry.promotionDiscount,
        rewardAllocation: entry.rewardAllocation,
        discountAmount,
        discountSource,
        discountLabel: entry.promotionApplied
          ? entry.promotionLabel
          : entry.rewardAllocation.gt(0)
            ? input.pricing.reward.label
            : null,
        preRewardTotal: entry.preRewardTotals.totalAmount,
        taxAmount: entry.projectedTotals.taxAmount,
        serviceCharge: entry.projectedTotals.serviceCharge,
        totalAmount: entry.projectedTotals.totalAmount,
      };
    }
  );

  assertPlanMoneyIdentities(orders, {
    totalAmount,
    discountAmount: new Decimal(projection.discountAmount),
    rewardAmount,
  });

  return {
    offline: false,
    businessDate: input.context.businessDate,
    businessDateFallback: false,
    outcome,
    visitState: resolved.visitState,
    totalAmount,
    discountAmount: new Decimal(projection.discountAmount),
    promotionDiscountAmount: new Decimal(projection.promotionDiscountAmount),
    rewardAmount,
    orders,
    visit,
    card,
    rewardSnapshot,
    ...cash,
    completedVisits,
    visitsRequired,
    cardReset,
    rewardApplied,
    memberId: member?.id ?? null,
  };
}

export interface OfflinePaymentOrderRow {
  id: string;
  orderNumber: string;
  createdAt: Date;
  subtotalAmount: MoneyInput;
  taxAmount: MoneyInput;
  serviceCharge: MoneyInput;
  totalAmount: MoneyInput;
  offlineCreated: boolean;
  offlineCreatedAt: Date | null;
  discountVersion: number;
}

export interface OfflineActiveDiscount {
  orderId: string;
  source: 'PROMOTION' | 'LOYALTY_REWARD';
  amount: MoneyInput;
  /** Ledger fields used to rebuild the per-order promotion flags. */
  sourceId?: string;
  label?: string;
  baseAmount?: MoneyInput;
}

export interface BuildOfflinePaymentPlanInput {
  orders: readonly OfflinePaymentOrderRow[];
  activeDiscounts: readonly OfflineActiveDiscount[];
  method: LoyaltyPaymentMethod;
  cashReceived?: MoneyInput;
  expectedTotal?: MoneyInput;
  expectedCashPayable?: MoneyInput;
  expectedBillRevision?: number;
  billRevision: number;
  cashRounding: 'NONE' | 'NEAREST_5_SEN' | null;
  /** True when any order of the bill was created offline. */
  offlineCreated: boolean;
  /**
   * True when the bill has a resolved member. Offline replay adds no benefit,
   * but `outcome` precedence still distinguishes a member (`NO_BENEFIT`) from a
   * guest (`GUEST`) (§18.20.15 D).
   */
  hasMember: boolean;
  now: Date;
  businessDate: Date;
  businessDateFallback: boolean;
}

/**
 * Offline replay decision. No new benefit is ever added:
 * - an offline-created order is full price, no visit, no discount;
 * - an online-priced order keeps its locked promotion and collects
 *   `preRewardTotal`/`preRewardCashPayable`; no reward and no visit;
 * - a replayed payment that carries a projected reward (an `expectedTotal`
 *   lower than `preRewardTotal`) is rejected for reconciliation, never
 *   settled silently.
 */
export function buildOfflinePaymentPlan(
  input: BuildOfflinePaymentPlanInput
): LoyaltyPaymentPlan {
  if (
    input.expectedBillRevision !== undefined &&
    input.expectedBillRevision !== input.billRevision
  ) {
    throw new LoyaltyPaymentError(
      'The bill changed. Reload the bill before replaying the payment.',
      'BILL_CHANGED',
      409
    );
  }

  const totalAmount = sumMoney(input.orders.map((order) => order.totalAmount));
  const expectedTotal = money(input.expectedTotal);
  if (expectedTotal && !expectedTotal.eq(totalAmount)) {
    throw new LoyaltyPaymentError(
      'The offline total does not match the locked bill. Reconcile before collecting.',
      'AMOUNT_MISMATCH',
      409
    );
  }

  const cashPayable =
    input.cashRounding === 'NEAREST_5_SEN' ? round5(totalAmount) : totalAmount;
  const cash = cashFigures({
    method: input.method,
    totalAmount,
    cashPayable,
    cashReceived: input.cashReceived,
    expectedCashPayable: input.expectedCashPayable,
  });

  const promotionRowsByOrder = new Map<string, OfflineActiveDiscount[]>();
  for (const discount of input.activeDiscounts) {
    const rows = promotionRowsByOrder.get(discount.orderId) ?? [];
    rows.push(discount);
    promotionRowsByOrder.set(discount.orderId, rows);
  }

  // Price each order from its own ACTIVE rows. An offline-created order is
  // always full price; a counter-created order with no ACTIVE row is also full
  // price (promotions are an order-time lock, §18.20.14 G/I). The bill flags are
  // the honest aggregate, so a mixed bill never reports "no benefit" while a
  // stored order total already includes a promotion.
  const orders: LoyaltyPaymentPlanOrder[] = input.orders.map((order) => {
    const rows = order.offlineCreated
      ? []
      : (promotionRowsByOrder.get(order.id) ?? []);
    const promotions = rows.filter((row) => row.source === 'PROMOTION');
    const rewards = rows.filter((row) => row.source === 'LOYALTY_REWARD');
    const promotionDiscount = sumMoney(promotions.map((row) => row.amount));
    const rewardDiscount = sumMoney(rewards.map((row) => row.amount));
    const promotionApplied = promotions.length > 0 && promotionDiscount.gt(0);
    const promotion = promotions[0] ?? null;
    const reward = rewards[0] ?? null;

    return {
      orderId: order.id,
      subtotal: new Decimal(order.subtotalAmount),
      promotionApplied,
      promotionId: promotion?.sourceId ?? null,
      promotion: null,
      promotionLabel: promotion?.label ?? null,
      eligibleBase:
        promotion?.baseAmount !== undefined
          ? new Decimal(promotion.baseAmount)
          : new Decimal(0),
      promotionDiscount,
      rewardAllocation: new Decimal(0),
      discountAmount: promotionDiscount.plus(rewardDiscount),
      discountSource: promotionApplied
        ? ('PROMOTION' as const)
        : rewardDiscount.gt(0)
          ? ('LOYALTY_REWARD' as const)
          : null,
      discountLabel: promotionApplied
        ? (promotion?.label ?? null)
        : (reward?.label ?? null),
      preRewardTotal: new Decimal(order.totalAmount),
      taxAmount: new Decimal(order.taxAmount),
      serviceCharge: new Decimal(order.serviceCharge),
      totalAmount: new Decimal(order.totalAmount),
    };
  });

  const promotionApplied = orders.some((order) => order.promotionApplied);
  const promotionDiscountAmount = sumMoney(
    orders.map((order) => order.promotionDiscount)
  );
  const discountAmount = sumMoney(orders.map((order) => order.discountAmount));

  return {
    offline: true,
    businessDate: input.businessDate,
    businessDateFallback: input.businessDateFallback,
    outcome: promotionApplied
      ? 'PROMOTION_APPLIED'
      : input.hasMember
        ? 'NO_BENEFIT'
        : 'GUEST',
    visitState: 'GUEST',
    totalAmount,
    discountAmount,
    promotionDiscountAmount,
    rewardAmount: new Decimal(0),
    orders,
    visit: null,
    card: null,
    rewardSnapshot: null,
    ...cash,
    completedVisits: null,
    visitsRequired: null,
    cardReset: false,
    rewardApplied: false,
    memberId: null,
  };
}

function assertPlanMoneyIdentities(
  orders: readonly LoyaltyPaymentPlanOrder[],
  expected: {
    totalAmount: Decimal;
    discountAmount: Decimal;
    rewardAmount: Decimal;
  }
): void {
  const allocated = sumMoney(orders.map((order) => order.rewardAllocation));
  if (!allocated.eq(expected.rewardAmount)) {
    throw new LoyaltyPaymentError(
      'The reward allocation does not equal the reward.',
      'DISCOUNT_ALLOCATION_FAILED',
      409
    );
  }

  for (const order of orders) {
    if (order.rewardAllocation.gt(order.subtotal)) {
      throw new LoyaltyPaymentError(
        'A reward allocation exceeds an order subtotal.',
        'DISCOUNT_ALLOCATION_FAILED',
        409
      );
    }
    if (order.discountAmount.gt(order.subtotal)) {
      throw new LoyaltyPaymentError(
        'A discount exceeds an order subtotal.',
        'DISCOUNT_ALLOCATION_FAILED',
        409
      );
    }
  }

  const orderTotal = sumMoney(orders.map((order) => order.totalAmount));
  if (!orderTotal.eq(expected.totalAmount)) {
    throw new LoyaltyPaymentError(
      'The order totals do not equal the bill total.',
      'DISCOUNT_ALLOCATION_FAILED',
      409
    );
  }

  const orderDiscount = sumMoney(orders.map((order) => order.discountAmount));
  if (!orderDiscount.eq(expected.discountAmount)) {
    throw new LoyaltyPaymentError(
      'The order discounts do not equal the bill discount.',
      'DISCOUNT_ALLOCATION_FAILED',
      409
    );
  }
}

// ============================================================================
// Bill resolution and locks
// ============================================================================

const PAYMENT_ORDER_SELECT = {
  ...BILL_ORDER_SELECT,
  orderNumber: true,
  dailySeq: true,
  taxAmount: true,
  serviceCharge: true,
  discountAmount: true,
  totalAmount: true,
  orderType: true,
  offlineCreated: true,
  offlineCreatedAt: true,
  discountVersion: true,
  customerId: true,
  customerName: true,
  customerPhone: true,
  diningSessionId: true,
  tableId: true,
  createdAt: true,
  table: {
    select: {
      id: true,
      tableNumber: true,
      tableName: true,
      locationDescription: true,
    },
  },
  restaurant: {
    select: {
      id: true,
      name: true,
      taxLabel: true,
      serviceChargeLabel: true,
      address: true,
      phone: true,
      email: true,
    },
  },
} as const;

type PaymentOrderRow = {
  id: string;
  orderNumber: string;
  dailySeq: number | null;
  subtotalAmount: MoneyInput;
  taxAmount: MoneyInput;
  serviceCharge: MoneyInput;
  discountAmount: MoneyInput;
  totalAmount: MoneyInput;
  taxRateSnapshot: MoneyInput;
  serviceChargeRateSnapshot: MoneyInput;
  paymentStatus: string;
  status: string;
  orderType: string;
  offlineCreated: boolean;
  offlineCreatedAt: Date | null;
  discountVersion: number;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  diningSessionId: string | null;
  tableId: string | null;
  createdAt: Date;
  table: {
    id: string;
    tableNumber: string;
    tableName: string | null;
    locationDescription: string | null;
  } | null;
  restaurant: {
    id: string;
    name: string;
    taxLabel: string | null;
    serviceChargeLabel: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  items: readonly {
    menuItemId: string;
    totalAmount: MoneyInput;
    menuItem: { name: string; categoryId: string };
  }[];
};

type ResolvedPaymentBill =
  | {
      kind: 'session';
      restaurantId: string;
      tableId: string;
      sessionId: string;
      billRevision: number;
      customerId: string | null;
      orders: PaymentOrderRow[];
      lockKey: string;
    }
  | {
      kind: 'order';
      restaurantId: string;
      orderId: string;
      billRevision: number;
      customerId: string | null;
      orders: PaymentOrderRow[];
      lockKey: string;
    };

function allNonCancelledPaid(orders: readonly PaymentOrderRow[]): boolean {
  const active = orders.filter((order) => order.status !== 'CANCELLED');
  return (
    active.length > 0 && active.every((order) => order.paymentStatus === 'PAID')
  );
}

async function resolvePaymentBill(
  tx: TransactionClient,
  input: LoyaltyTablePaymentInput | LoyaltyOrderPaymentInput
): Promise<ResolvedPaymentBill> {
  if ('tableId' in input) {
    const session = await tx.diningSession.findFirst({
      where: {
        tableId: input.tableId,
        restaurantId: input.restaurantId,
        status: 'OPEN',
      },
      orderBy: { openedAt: 'desc' },
      select: { id: true, billRevision: true, customerId: true },
    });

    if (!session) {
      throw new LoyaltyPaymentError(
        'The bill changed. Reload the bill before taking payment.',
        'BILL_CHANGED',
        409
      );
    }

    const orders = await tx.order.findMany({
      where: {
        restaurantId: input.restaurantId,
        diningSessionId: session.id,
      },
      select: PAYMENT_ORDER_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    return {
      kind: 'session',
      restaurantId: input.restaurantId,
      tableId: input.tableId,
      sessionId: session.id,
      billRevision: session.billRevision,
      customerId: session.customerId,
      orders,
      lockKey: `loyalty-bill:${input.restaurantId}:${session.id}`,
    };
  }

  const order = await tx.order.findFirst({
    where: { id: input.orderId, restaurantId: input.restaurantId },
    select: PAYMENT_ORDER_SELECT,
  });

  if (!order) {
    throw new LoyaltyPaymentError('Order not found', 'ORDER_NOT_FOUND', 404);
  }
  if (order.orderType !== 'TAKEAWAY' || order.tableId !== null) {
    throw new LoyaltyPaymentError(
      'This payment endpoint is for takeaway orders only',
      'ORDER_NOT_TAKEAWAY',
      409
    );
  }
  if (order.paymentStatus !== 'PENDING') {
    throw new LoyaltyPaymentError(
      'Order is already paid or is not payable',
      'ORDER_NOT_PAYABLE',
      409
    );
  }
  if (order.status === 'PENDING' || order.status === 'CANCELLED') {
    throw new LoyaltyPaymentError(
      'Confirm the order before taking payment',
      'ORDER_NOT_CONFIRMED',
      409
    );
  }

  return {
    kind: 'order',
    restaurantId: input.restaurantId,
    orderId: order.id,
    billRevision: order.discountVersion,
    customerId: order.customerId,
    orders: [order],
    lockKey: `loyalty-bill:${input.restaurantId}:${order.id}`,
  };
}

async function acquireLock(
  tx: TransactionClient,
  lockKey: string
): Promise<void> {
  // pg_advisory_xact_lock returns void; cast it to text so Prisma can decode it.
  await tx.$queryRaw<Array<{ lock: string }>>`
    SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
  `;
}

function payableOrdersOf(bill: ResolvedPaymentBill): PaymentOrderRow[] {
  return bill.orders.filter(
    (order) => order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED'
  );
}

function assertPayableOrders(
  bill: ResolvedPaymentBill,
  input: LoyaltyTablePaymentInput | LoyaltyOrderPaymentInput
): PaymentOrderRow[] {
  const payable = payableOrdersOf(bill);

  if (payable.length === 0) {
    if (allNonCancelledPaid(bill.orders)) {
      throw new LoyaltyPaymentError(
        'This bill is already paid.',
        'BILL_PAID',
        409
      );
    }
    throw new LoyaltyPaymentError(
      'No eligible unpaid orders found for this bill.',
      'NO_ELIGIBLE_ORDERS',
      409
    );
  }

  if (payable.some((order) => order.status === 'PENDING')) {
    throw new LoyaltyPaymentError(
      'Confirm all pending orders before taking payment.',
      'ORDER_NOT_CONFIRMED',
      409
    );
  }

  if ('orderIds' in input && input.orderIds && input.orderIds.length > 0) {
    const requested = [...input.orderIds].sort();
    const eligible = payable.map((order) => order.id).sort();
    if (
      requested.length !== eligible.length ||
      requested.some((id, index) => id !== eligible[index])
    ) {
      throw new LoyaltyPaymentError(
        'The bill changed. Reload the bill before taking payment.',
        'BILL_CHANGED',
        409
      );
    }
  }

  return payable;
}

// ============================================================================
// Ledger writes
// ============================================================================

function processedByFields(
  userId: string,
  userType: string
): Pick<
  Prisma.PaymentUncheckedCreateInput,
  | 'processedBy'
  | 'processedByType'
  | 'processedByAdminId'
  | 'processedByOwnerId'
  | 'processedByStaffId'
> {
  if (userType === 'platform_admin') {
    return {
      processedBy: userId,
      processedByType: userType,
      processedByAdminId: userId,
    };
  }
  if (userType === 'restaurant_owner') {
    return {
      processedBy: userId,
      processedByType: userType,
      processedByOwnerId: userId,
    };
  }
  return {
    processedBy: userId,
    processedByType: userType,
    processedByStaffId: userId,
  };
}

function rewardSnapshot(
  snapshot: LoyaltyPaymentPlanRewardSnapshot
): Prisma.InputJsonValue {
  return {
    rewardLabel: snapshot.label,
    rewardType: snapshot.rewardType,
    rewardValue: snapshot.rewardValue,
    maxDiscount: snapshot.maxDiscount,
    cycleNumber: snapshot.cycleNumber,
    visitsRequired: snapshot.visitsRequired,
  } as Prisma.InputJsonValue;
}

interface ExistingDiscountRow {
  id: string;
  orderId: string;
  source: 'PROMOTION' | 'LOYALTY_REWARD';
  sourceId: string;
  baseAmount: MoneyInput;
  amount: MoneyInput;
}

/**
 * Reconcile the ACTIVE ledger with the payment plan.
 *
 * Order create is the definitive price lock (§18.20.14 G). Payment therefore
 * never creates, replaces or removes a `PROMOTION` row: an ACTIVE row stands
 * even when the live promotion has since expired, and no row means the order is
 * full price. Payment only writes the `LOYALTY_REWARD` row it is applying.
 * Offline replay never calls this.
 */
async function reconcileDiscounts(
  tx: TransactionClient,
  input: LoyaltyPaymentBaseInput,
  bill: ResolvedPaymentBill,
  plan: LoyaltyPaymentPlan,
  visitId: string | null
): Promise<void> {
  const orderIds = plan.orders.map((order) => order.orderId);
  if (orderIds.length === 0) return;

  const existing = await tx.orderDiscount.findMany({
    where: {
      restaurantId: input.restaurantId,
      orderId: { in: orderIds },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      orderId: true,
      source: true,
      sourceId: true,
      baseAmount: true,
      amount: true,
    },
  });

  const byOrder = new Map<string, ExistingDiscountRow[]>();
  for (const row of existing) {
    const rows = byOrder.get(row.orderId) ?? [];
    rows.push(row as ExistingDiscountRow);
    byOrder.set(row.orderId, rows);
  }

  const diningSessionId = bill.kind === 'session' ? bill.sessionId : null;

  for (const order of plan.orders) {
    const current = byOrder.get(order.orderId) ?? [];

    // A promotion is the order-time price lock: leave it exactly as written.
    if (order.promotionApplied) continue;

    if (order.rewardAllocation.gt(0) && visitId && plan.rewardSnapshot) {
      const desired = {
        source: 'LOYALTY_REWARD' as const,
        sourceId: visitId,
        baseAmount: order.subtotal,
        amount: order.rewardAllocation,
      };

      const matches =
        current.length === 1 &&
        current[0].source === desired.source &&
        current[0].sourceId === desired.sourceId &&
        new Decimal(current[0].baseAmount).eq(desired.baseAmount) &&
        new Decimal(current[0].amount).eq(desired.amount);

      if (matches) continue;

      // Never remove another flow's ACTIVE row at payment.
      if (current.length > 0) continue;

      await tx.orderDiscount.create({
        data: {
          orderId: order.orderId,
          restaurantId: input.restaurantId,
          diningSessionId,
          source: 'LOYALTY_REWARD',
          sourceId: desired.sourceId,
          label: plan.rewardSnapshot.label,
          baseAmount: desired.baseAmount,
          amount: desired.amount,
          promotionSnapshot: undefined,
          rewardSnapshot: rewardSnapshot(plan.rewardSnapshot),
          status: 'ACTIVE',
          actorType: input.userType,
          actorId: input.userId,
        },
      });
    }
  }
}

// ============================================================================
// Response
// ============================================================================

function buildPaymentResponse(input: {
  bill: ResolvedPaymentBill;
  plan: LoyaltyPaymentPlan;
  payments: Array<{
    id: string;
    orderId: string;
    amount: MoneyInput;
    receiptNumber: string | null;
  }>;
  /**
   * The full first `Payment` row. The loyalty response must be a superset of
   * the legacy response, which spreads the complete Prisma row (status,
   * paymentMethod, batchId, netAmount, processingFee, dailySeq,
   * externalTransactionId, paymentMetadata, processedAt, completedAt, ...).
   */
  firstPayment: Record<string, unknown> | null;
  receiptNumber: string;
  batchId: string;
  recordedOffline: boolean;
}): Record<string, unknown> {
  const { bill, plan } = input;
  const firstOrder = plan.orders[0];
  const firstRow = bill.orders[0];
  const subtotal = sumMoney(plan.orders.map((order) => order.subtotal));
  const taxAmount = sumMoney(plan.orders.map((order) => order.taxAmount));
  const serviceCharge = sumMoney(
    plan.orders.map((order) => order.serviceCharge)
  );

  const combinedPayment = {
    ...(input.firstPayment ?? input.payments[0]),
    amount: toMoneyString(plan.totalAmount),
    cashReceived: plan.cashReceived
      ? toMoneyString(plan.cashReceived)
      : toMoneyString(plan.totalAmount),
    changeGiven: plan.changeGiven ? toMoneyString(plan.changeGiven) : '0.00',
    receiptNumber: input.receiptNumber,
    order: {
      id: firstOrder?.orderId ?? (bill.kind === 'order' ? bill.orderId : null),
      orderNumber:
        bill.kind === 'session'
          ? `TABLE-${plan.orders.length}-ORDERS`
          : (firstRow?.orderNumber ?? ''),
      ...(bill.kind === 'order'
        ? {
            orderType: firstRow?.orderType ?? 'TAKEAWAY',
            pickupNumber: formatPickupNumber(firstRow?.dailySeq ?? null),
            customerName: firstRow?.customerName ?? null,
            customerPhone: firstRow?.customerPhone ?? null,
          }
        : {}),
      tableId: bill.kind === 'session' ? bill.tableId : null,
      table: bill.kind === 'session' ? (firstRow?.table ?? null) : null,
      createdAt: firstRow?.createdAt ?? new Date(),
      totalAmount: toMoneyString(plan.totalAmount),
      subtotalAmount: toMoneyString(subtotal),
      taxAmount: toMoneyString(taxAmount),
      serviceCharge: toMoneyString(serviceCharge),
      discountAmount: toMoneyString(plan.discountAmount),
      items: plan.orders.flatMap((planOrder) => {
        // Only the orders paid in this request: a second payment in the same
        // session must not return items from an earlier paid payment.
        const order = bill.orders.find((row) => row.id === planOrder.orderId);
        if (!order) return [];
        return order.items.map((item) => ({
          ...item,
          orderNumber: order.orderNumber,
        }));
      }),
      restaurant: firstRow?.restaurant ?? null,
      taxLabel: firstRow?.restaurant?.taxLabel || 'Tax',
      serviceChargeLabel:
        firstRow?.restaurant?.serviceChargeLabel || 'Service Charge',
    },
  };

  const response: Record<string, unknown> = {
    success: true,
    message:
      bill.kind === 'session'
        ? `Processed payment for ${plan.orders.length} orders`
        : `Processed payment for order ${firstRow?.orderNumber ?? ''}`,
    receiptNumber: input.receiptNumber,
    ordersProcessed: plan.orders.length,
    totalPaid: toMoneyString(plan.totalAmount),
    changeGiven: plan.changeGiven ? toMoneyString(plan.changeGiven) : '0.00',
    recordedOffline: input.recordedOffline,
    payment: combinedPayment,
    payments: input.payments.map((payment) => ({
      id: payment.id,
      orderId: payment.orderId,
      amount: toMoneyString(payment.amount),
      receiptNumber: payment.receiptNumber,
    })),
    paymentBatchId: input.batchId,
    outcome: plan.outcome,
    completedVisits: plan.completedVisits,
    visitsRequired: plan.visitsRequired,
    discountAmount: toMoneyString(plan.discountAmount),
    projectedTotal: toMoneyString(plan.totalAmount),
    preRewardTotal: toMoneyString(
      sumMoney(plan.orders.map((order) => order.preRewardTotal))
    ),
    cashPayable: plan.cashPayable ? toMoneyString(plan.cashPayable) : null,
    roundingAdjustment: plan.roundingAdjustment
      ? toMoneyString(plan.roundingAdjustment)
      : null,
    businessDate: plan.businessDate.toISOString().slice(0, 10),
    billRevision: bill.billRevision,
  };

  if (plan.memberId) {
    response.cardReset = plan.cardReset;
    response.rewardApplied = plan.rewardApplied;
  }
  if (plan.offline && plan.businessDateFallback) {
    response.offlineBusinessDateFallback = true;
  }

  return response;
}

// ============================================================================
// Transaction
// ============================================================================

/**
 * The bill-level label for a dine-in session. Multiple distinct promotions use
 * the same `'Promotions'` label as the projection (§18.20.15 D).
 */
function sessionDiscountLabel(
  plan: LoyaltyPaymentPlan,
  source: 'PROMOTION' | 'LOYALTY_REWARD' | 'MULTIPLE' | null
): string | null {
  if (source === 'LOYALTY_REWARD') return plan.rewardSnapshot?.label ?? null;
  if (source !== 'PROMOTION') return null;

  const promotionOrders = plan.orders.filter((order) => order.promotionApplied);
  if (promotionOrders.length === 0) return null;

  const ids = new Set(
    promotionOrders
      .map((order) => order.promotionId)
      .filter((id): id is string => id !== null)
  );
  const labels = new Set(
    promotionOrders
      .map((order) => order.promotionLabel)
      .filter((label): label is string => label !== null)
  );
  const multiple = ids.size > 1 || labels.size > 1;

  return multiple ? 'Promotions' : (promotionOrders[0].promotionLabel ?? null);
}

async function applyPaymentPlan(
  tx: TransactionClient,
  input: LoyaltyPaymentBaseInput,
  bill: ResolvedPaymentBill,
  plan: LoyaltyPaymentPlan,
  receiptNumber: string,
  dailySeq: number,
  requestHash: string
): Promise<Record<string, unknown>> {
  const batchId = randomUUID();
  const processedBy = processedByFields(input.userId, input.userType);
  const now = input.now ?? new Date();

  // 1. PaymentBatch (businessDate/rounding/outcome).
  await tx.paymentBatch.create({
    data: {
      id: batchId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      restaurantId: input.restaurantId,
      tableId: bill.kind === 'session' ? bill.tableId : null,
      orderId: bill.kind === 'order' ? bill.orderId : null,
      paymentMethod: input.paymentMethod,
      totalAmount: plan.totalAmount,
      cashReceived: plan.cashReceived,
      changeGiven: plan.changeGiven,
      receiptNumber,
      status: 'COMPLETED',
      response: {},
      businessDate: plan.businessDate,
      cashPayable: plan.cashPayable,
      roundingAdjustment: plan.roundingAdjustment,
      outcome: plan.outcome as PaymentOutcome,
      ...processedBy,
    },
  });

  // 2. LoyaltyVisit (only when no promotion and the day qualifies).
  let visitId: string | null = null;
  if (plan.visit) {
    const visit = await tx.loyaltyVisit.create({
      data: {
        customerId: plan.visit.customerId,
        restaurantId: input.restaurantId,
        phoneHash: plan.visit.phoneHash,
        businessDate: plan.businessDate,
        cycleNumber: plan.visit.cycleNumber,
        visitsRequired: plan.visit.visitsRequired,
        orderId: bill.kind === 'order' ? bill.orderId : null,
        diningSessionId: bill.kind === 'session' ? bill.sessionId : null,
        paymentBatchId: batchId,
      },
      select: { id: true },
    });
    visitId = visit.id;
  }

  // 3. LoyaltyCard: one UPDATE that increments or resets.
  if (plan.card) {
    const visitCustomerId = plan.visit?.customerId;
    if (!visitCustomerId) {
      throw new LoyaltyPaymentError(
        'A card change requires a counting visit.',
        'DISCOUNT_ALLOCATION_FAILED',
        409
      );
    }
    if (plan.card.create) {
      await tx.loyaltyCard.create({
        data: {
          restaurantId: input.restaurantId,
          customerId: visitCustomerId,
          visitsInCycle: plan.card.visitsInCycle,
          cycleNumber: plan.card.cycleNumber,
          visitsRequired: plan.card.snapshot.visitsRequired,
          rewardType: plan.card.snapshot.rewardType,
          rewardValue: new Decimal(plan.card.snapshot.rewardValue),
          maxDiscount: new Decimal(plan.card.snapshot.maxDiscount),
          rewardLabel: plan.card.snapshot.rewardLabel,
          minDailySpend: new Decimal(plan.card.snapshot.minDailySpend),
          cycleStartedAt: now,
          lastRewardAt: plan.card.rewardApplied ? now : null,
        },
      });
    } else if (plan.card.reset) {
      await tx.loyaltyCard.update({
        where: {
          restaurantId_customerId: {
            restaurantId: input.restaurantId,
            customerId: visitCustomerId,
          },
        },
        data: {
          visitsInCycle: 0,
          cycleNumber: { increment: 1 },
          ...(plan.card.rewardApplied ? { lastRewardAt: now } : {}),
        },
      });
    } else {
      await tx.loyaltyCard.update({
        where: {
          restaurantId_customerId: {
            restaurantId: input.restaurantId,
            customerId: visitCustomerId,
          },
        },
        data: { visitsInCycle: { increment: 1 } },
      });
    }
  }

  // 4. OrderDiscount ledger. Offline replay never removes an ACTIVE discount.
  if (!plan.offline) {
    await reconcileDiscounts(tx, input, bill, plan, visitId);
  }

  // 5. Order totals + paid state.
  for (const order of plan.orders) {
    const updated = await tx.order.updateMany({
      where: {
        id: order.orderId,
        restaurantId: input.restaurantId,
        paymentStatus: 'PENDING',
        status: { notIn: ['PENDING', 'CANCELLED'] },
      },
      data: plan.offline
        ? { paymentStatus: 'PAID' }
        : {
            paymentStatus: 'PAID',
            discountAmount: order.discountAmount,
            discountSource: order.discountSource,
            discountLabel: order.discountLabel,
            discountVersion: { increment: 1 },
            taxAmount: order.taxAmount,
            serviceCharge: order.serviceCharge,
            totalAmount: order.totalAmount,
          },
    });

    if (updated.count !== 1) {
      throw new LoyaltyPaymentError(
        'The bill changed. Reload the bill before taking payment.',
        'BILL_CHANGED',
        409
      );
    }
  }

  if (bill.kind === 'session' && !plan.offline) {
    const source =
      plan.promotionDiscountAmount.gt(0) && plan.rewardAmount.gt(0)
        ? ('MULTIPLE' as const)
        : plan.promotionDiscountAmount.gt(0)
          ? ('PROMOTION' as const)
          : plan.rewardAmount.gt(0)
            ? ('LOYALTY_REWARD' as const)
            : null;
    await tx.diningSession.update({
      where: {
        restaurantId_id: {
          restaurantId: input.restaurantId,
          id: bill.sessionId,
        },
      },
      data: {
        discountAmount: plan.discountAmount,
        discountSource: source,
        discountLabel: sessionDiscountLabel(plan, source),
      },
    });
  }

  // 6. Payment rows. Per-order amount is the exact order total; cash rounding
  // is bill-level on the batch.
  const payments: Array<{
    id: string;
    orderId: string;
    amount: MoneyInput;
    receiptNumber: string | null;
  }> = [];
  let firstPayment: Record<string, unknown> | null = null;
  for (let index = 0; index < plan.orders.length; index++) {
    const order = plan.orders[index];
    const isFirst = index === 0;
    const billOrder = bill.orders.find((row) => row.id === order.orderId);
    const orderNumber = billOrder?.orderNumber ?? order.orderId;
    const paymentReceipt =
      bill.kind === 'session' ? `${receiptNumber}-${index + 1}` : receiptNumber;

    const payment = await tx.payment.create({
      data: {
        orderId: order.orderId,
        batchId,
        paymentMethod: input.paymentMethod,
        amount: new Decimal(order.totalAmount),
        processingFee: new Decimal(0),
        netAmount: new Decimal(order.totalAmount),
        status: 'PAID',
        cashReceived:
          input.paymentMethod === 'cash'
            ? isFirst
              ? plan.cashReceived
              : new Decimal(0)
            : null,
        changeGiven:
          input.paymentMethod === 'cash'
            ? isFirst
              ? plan.changeGiven
              : new Decimal(0)
            : null,
        receiptNumber: paymentReceipt,
        dailySeq,
        externalTransactionId: input.externalTransactionId,
        paymentMetadata: {
          tablePayment: bill.kind === 'session',
          orderPayment: bill.kind === 'order',
          orderNumber,
          primaryReceipt: receiptNumber,
          isFirstOrder: isFirst,
          orderIndex: index + 1,
          totalOrders: plan.orders.length,
          notes: input.notes,
          recordedOffline: input.recordedOffline === true,
          idempotencyKey: input.idempotencyKey,
          loyaltyOutcome: plan.outcome,
        },
        processedAt: now,
        completedAt: now,
        ...processedBy,
      },
    });

    payments.push({
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      receiptNumber: payment.receiptNumber,
    });

    if (isFirst) {
      // Keep the full row for the `payment` response object (F-03).
      firstPayment = payment as unknown as Record<string, unknown>;
    }

    await tx.auditLog.create({
      data: {
        tableName: 'payments',
        recordId: payment.id,
        operation: 'CREATE',
        newValues: {
          orderId: order.orderId,
          orderNumber,
          amount: toMoneyString(order.totalAmount),
          receiptNumber,
          tablePayment: bill.kind === 'session',
          orderPayment: bill.kind === 'order',
          idempotencyKey: input.idempotencyKey,
          loyaltyOutcome: plan.outcome,
        },
        changedBy: input.userId,
        changedByType: input.userType,
        ...(input.userType === 'platform_admin'
          ? { adminId: input.userId }
          : input.userType === 'restaurant_owner'
            ? { ownerId: input.userId }
            : { staffId: input.userId }),
      },
    });
  }

  assertWriteIdentities(payments, plan);

  const response = buildPaymentResponse({
    bill,
    plan,
    payments,
    firstPayment,
    receiptNumber,
    batchId,
    recordedOffline: input.recordedOffline === true,
  });

  const serializable = JSON.parse(
    JSON.stringify(response)
  ) as Prisma.InputJsonValue;

  await tx.paymentBatch.update({
    where: { id: batchId },
    data: { response: serializable },
  });

  // 7. PAYMENT idempotency record, completed in the same transaction.
  await tx.idempotencyRecord.update({
    where: {
      restaurantId_scope_key: {
        restaurantId: input.restaurantId,
        scope: 'PAYMENT',
        key: input.idempotencyKey,
      },
    },
    data: { status: 'COMPLETED', responseJson: serializable },
  });

  return serializable as Record<string, unknown>;
}

function assertWriteIdentities(
  payments: readonly { amount: MoneyInput }[],
  plan: LoyaltyPaymentPlan
): void {
  const paid = sumMoney(payments.map((payment) => payment.amount));
  if (!paid.eq(plan.totalAmount)) {
    throw new LoyaltyPaymentError(
      'The payment rows do not equal the batch total.',
      'DISCOUNT_ALLOCATION_FAILED',
      409
    );
  }

  const orderTotal = sumMoney(plan.orders.map((order) => order.totalAmount));
  if (!orderTotal.eq(plan.totalAmount)) {
    throw new LoyaltyPaymentError(
      'The order totals do not equal the batch total.',
      'DISCOUNT_ALLOCATION_FAILED',
      409
    );
  }

  if (plan.cashPayable && plan.cashReceived && plan.changeGiven) {
    if (!plan.cashReceived.minus(plan.changeGiven).eq(plan.cashPayable)) {
      throw new LoyaltyPaymentError(
        'The cash drawer does not reconcile.',
        'CASH_ROUNDING_FAILED',
        409
      );
    }
  }
}

// ============================================================================
// Idempotency
// ============================================================================

const PAYMENT_SCOPE = 'PAYMENT';
const PAYMENT_RETENTION_MS = 24 * 60 * 60 * 1000;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function uniqueTarget(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) return [];
  const meta = (error as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

function moneyHash(value: MoneyInput | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return new Decimal(value).toFixed(2);
}

function paymentRequestHash(input: LoyaltyPaymentBaseInput): string {
  const tableInput =
    'tableId' in input ? (input as LoyaltyTablePaymentInput) : null;
  const orderInput =
    'orderId' in input ? (input as LoyaltyOrderPaymentInput) : null;
  const normalized = {
    restaurantId: input.restaurantId,
    tableId: tableInput?.tableId ?? null,
    orderId: orderInput?.orderId ?? null,
    orderIds: tableInput?.orderIds ? [...tableInput.orderIds].sort() : null,
    paymentMethod: input.paymentMethod,
    cashReceived: moneyHash(input.cashReceived),
    expectedTotal: moneyHash(input.expectedTotal),
    expectedCashPayable: moneyHash(input.expectedCashPayable),
    expectedBillRevision: input.expectedBillRevision ?? null,
    externalTransactionId: input.externalTransactionId ?? null,
    notes: input.notes ?? null,
  };
  // The hash is an integrity check, not a security primitive.
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

interface PaymentRecordClaim {
  /** Non-null when the request is a replay and must not run the transaction. */
  replay: LoyaltyPaymentResult | null;
  /** True only when this request inserted the IN_PROGRESS record. */
  created: boolean;
}

async function beginPaymentRecord(
  input: LoyaltyPaymentBaseInput,
  requestHash: string,
  now: Date
): Promise<PaymentRecordClaim> {
  const existing = await prisma.paymentBatch.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    assertReplayMatches(existing, requestHash, input);
    return {
      replay: {
        replayed: true,
        response: existing.response as Record<string, unknown>,
      },
      created: false,
    };
  }

  // Drop an expired record left by a crashed request. A committed payment has a
  // PaymentBatch (checked above), so deleting an expired record cannot hide a
  // charge.
  const expired = await prisma.idempotencyRecord.findUnique({
    where: {
      restaurantId_scope_key: {
        restaurantId: input.restaurantId,
        scope: PAYMENT_SCOPE,
        key: input.idempotencyKey,
      },
    },
    select: { id: true, expiresAt: true },
  });
  if (expired && expired.expiresAt.getTime() <= now.getTime()) {
    await prisma.idempotencyRecord.delete({ where: { id: expired.id } });
  }

  try {
    await prisma.idempotencyRecord.create({
      data: {
        restaurantId: input.restaurantId,
        scope: PAYMENT_SCOPE,
        key: input.idempotencyKey,
        requestHash,
        status: 'IN_PROGRESS',
        createdAt: now,
        expiresAt: new Date(now.getTime() + PAYMENT_RETENTION_MS),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const batch = await prisma.paymentBatch.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (batch) {
      assertReplayMatches(batch, requestHash, input);
      return {
        replay: {
          replayed: true,
          response: batch.response as Record<string, unknown>,
        },
        created: false,
      };
    }

    // PAYMENT takeover is deliberately not performed (§18.20.14 F): a payment
    // that might be committing must never be re-run. The cashier retries with a
    // new key after reloading.
    throw new LoyaltyPaymentError(
      'A payment with this idempotency key is already in progress.',
      'PAYMENT_IN_PROGRESS',
      409
    );
  }

  return { replay: null, created: true };
}

function assertReplayMatches(
  batch: {
    requestHash: string;
    restaurantId: string;
    tableId: string | null;
    orderId: string | null;
  },
  requestHash: string,
  input: LoyaltyPaymentBaseInput
): void {
  if (batch.restaurantId !== input.restaurantId) {
    throw new LoyaltyPaymentError(
      'Idempotency key belongs to another restaurant',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }
  const expectedTable = 'tableId' in input ? input.tableId : null;
  if (batch.tableId !== expectedTable) {
    throw new LoyaltyPaymentError(
      'Idempotency key belongs to another table',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }
  const expectedOrder = 'orderId' in input ? input.orderId : null;
  if (batch.orderId !== expectedOrder) {
    throw new LoyaltyPaymentError(
      'Idempotency key belongs to another order',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }
  if (batch.requestHash !== requestHash) {
    throw new LoyaltyPaymentError(
      'Idempotency key was reused with a different request',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }
}

async function clearFailedPaymentRecord(
  input: LoyaltyPaymentBaseInput
): Promise<void> {
  // A known validation failure rolled the payment transaction back, so no
  // PaymentBatch exists and the key is safe to retry after the cashier reloads.
  try {
    await prisma.idempotencyRecord.deleteMany({
      where: {
        restaurantId: input.restaurantId,
        scope: PAYMENT_SCOPE,
        key: input.idempotencyKey,
        status: 'IN_PROGRESS',
      },
    });
  } catch {
    // Best effort: a stuck IN_PROGRESS record fails closed.
  }
}

// ============================================================================
// Public entry points
// ============================================================================

async function processLoyaltyPayment(
  input: LoyaltyTablePaymentInput | LoyaltyOrderPaymentInput
): Promise<LoyaltyPaymentResult> {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    throw new LoyaltyPaymentError(
      'A valid Idempotency-Key header is required',
      'IDEMPOTENCY_KEY_REQUIRED',
      400
    );
  }

  const now = input.now ?? new Date();
  const requestHash = paymentRequestHash(input);

  const claim = await beginPaymentRecord(input, requestHash, now);
  if (claim.replay) return claim.replay;

  const { number: dailySeq, formatted: receiptNumber } =
    await SequenceManager.getNextReceipt(input.restaurantId);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const restaurant = await tx.restaurant.findUnique({
          where: { id: input.restaurantId },
          select: {
            cashRounding: true,
            timezone: true,
            businessDayCloseTime: true,
          },
        });
        if (!restaurant) {
          throw new LoyaltyPaymentError(
            'Restaurant not found',
            'LOYALTY_DISABLED',
            409
          );
        }

        const clock = {
          timezone: restaurant.timezone || 'Asia/Kuala_Lumpur',
          closeTime: restaurant.businessDayCloseTime || '04:00',
        };
        const businessDate = toDbBusinessDate(getBusinessDate(now, clock));

        // Resolve the bill identity before taking locks, then re-read under the
        // bill lock. A member change between the two reads is a BILL_CHANGED
        // retry; it never inverts the customer/day → bill/order lock order.
        const pre = await resolvePaymentBill(tx, input);

        if (pre.customerId) {
          await acquireLock(
            tx,
            `loyalty-day:${input.restaurantId}:${pre.customerId}:${businessDate
              .toISOString()
              .slice(0, 10)}`
          );
        }
        await acquireLock(tx, pre.lockKey);

        const bill = await resolvePaymentBill(tx, input);
        if (
          bill.customerId !== pre.customerId ||
          bill.billRevision !== pre.billRevision
        ) {
          throw new LoyaltyPaymentError(
            'The bill changed. Reload the bill before taking payment.',
            'BILL_CHANGED',
            409
          );
        }

        // A concurrent request with the same key may have committed between the
        // fast replay check and this lock.
        const lockedExisting = await tx.paymentBatch.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (lockedExisting) {
          assertReplayMatches(lockedExisting, requestHash, input);
          await tx.idempotencyRecord.updateMany({
            where: {
              restaurantId: input.restaurantId,
              scope: PAYMENT_SCOPE,
              key: input.idempotencyKey,
              status: 'IN_PROGRESS',
            },
            data: {
              status: 'COMPLETED',
              responseJson: lockedExisting.response as Prisma.InputJsonValue,
            },
          });
          return {
            replayed: true,
            response: lockedExisting.response as Record<string, unknown>,
          };
        }

        if (input.expectedBillRevision === undefined) {
          throw new LoyaltyPaymentError(
            'Reload the bill before taking payment.',
            'BILL_CHANGED',
            409
          );
        }
        if (input.expectedBillRevision !== bill.billRevision) {
          throw new LoyaltyPaymentError(
            'The bill changed. Reload the bill before taking payment.',
            'BILL_CHANGED',
            409
          );
        }

        const payable = assertPayableOrders(bill, input);

        const offline =
          input.recordedOffline === true ||
          payable.some((order) => order.offlineCreated);

        // Payment prices an existing order from its ACTIVE ledger rows, never
        // from a live promotion re-evaluation: order create is the definitive
        // price lock (§18.20.14 G/I). An ACTIVE promotion row stands even after
        // its window closes; no row means the order is full price.
        const activeDiscountRows = await tx.orderDiscount.findMany({
          where: {
            restaurantId: input.restaurantId,
            orderId: { in: payable.map((order) => order.id) },
            status: 'ACTIVE',
          },
          select: {
            orderId: true,
            source: true,
            sourceId: true,
            label: true,
            baseAmount: true,
            amount: true,
            promotionSnapshot: true,
          },
        });
        const activeDiscounts: BillActiveDiscount[] = activeDiscountRows.map(
          (discount) => ({
            orderId: discount.orderId,
            source: discount.source,
            sourceId: discount.sourceId,
            label: discount.label,
            baseAmount: discount.baseAmount,
            amount: discount.amount,
            promotionSnapshot:
              discount.promotionSnapshot as BillActiveDiscountSnapshot | null,
          })
        );

        let plan: LoyaltyPaymentPlan;

        if (offline) {
          const offlineDate = offlineBusinessDate(bill.orders, clock, now);

          plan = buildOfflinePaymentPlan({
            orders: payable.map((order) => ({
              id: order.id,
              orderNumber: order.orderNumber,
              createdAt: order.createdAt,
              subtotalAmount: order.subtotalAmount,
              taxAmount: order.taxAmount,
              serviceCharge: order.serviceCharge,
              totalAmount: order.totalAmount,
              offlineCreated: order.offlineCreated,
              offlineCreatedAt: order.offlineCreatedAt,
              discountVersion: order.discountVersion,
            })),
            activeDiscounts,
            method: input.paymentMethod,
            cashReceived: input.cashReceived,
            expectedTotal: input.expectedTotal,
            expectedCashPayable: input.expectedCashPayable,
            expectedBillRevision: input.expectedBillRevision,
            billRevision: bill.billRevision,
            cashRounding: restaurant.cashRounding ?? 'NONE',
            offlineCreated: payable.some((order) => order.offlineCreated),
            hasMember: bill.customerId !== null,
            now,
            businessDate: offlineDate.businessDate,
            businessDateFallback: offlineDate.fallback,
          });
        } else {
          if (input.expectedTotal === undefined) {
            throw new LoyaltyPaymentError(
              'Reload the bill before taking payment.',
              'BILL_CHANGED',
              409
            );
          }

          const loaded = await projectBillPricing({
            db: tx,
            restaurantId: input.restaurantId,
            orders: bill.orders,
            customerId: bill.customerId,
            billRevision: bill.billRevision,
            activeDiscounts,
            now,
          });
          if (!loaded) {
            throw new LoyaltyPaymentError(
              'Loyalty is off for this restaurant.',
              'LOYALTY_DISABLED',
              409
            );
          }

          if (
            loaded.context.businessDate.getTime() !== businessDate.getTime()
          ) {
            throw new LoyaltyPaymentError(
              'The business day changed. Reload the bill before taking payment.',
              'BILL_CHANGED',
              409
            );
          }

          plan = buildLoyaltyPaymentPlan({
            pricing: loaded.pricing,
            context: loaded.context,
            method: input.paymentMethod,
            cashReceived: input.cashReceived,
            expectedTotal: input.expectedTotal,
            expectedCashPayable: input.expectedCashPayable,
            expectedBillRevision: input.expectedBillRevision,
            billRevision: bill.billRevision,
            now,
          });
        }

        return {
          replayed: false,
          response: await applyPaymentPlan(
            tx,
            input,
            bill,
            plan,
            receiptNumber,
            dailySeq,
            requestHash
          ),
        };
      },
      { maxWait: 5000, timeout: 15000 }
    );

    if (!result.replayed) {
      await recordRestaurantChange({
        restaurantId: input.restaurantId,
        entityType: 'payment',
        entityId:
          (result.response.paymentBatchId as string | undefined) ??
          input.idempotencyKey,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof LoyaltyPaymentError) {
      // Only this request's own IN_PROGRESS record may be cleared. A
      // PAYMENT_IN_PROGRESS/IDEMPOTENCY_MISMATCH belongs to another request
      // (or a concurrent batch) and must survive, otherwise a third attempt
      // could run against a payment that is still committing (§18.20.14 F).
      if (
        claim.created &&
        error.code !== 'PAYMENT_IN_PROGRESS' &&
        error.code !== 'IDEMPOTENCY_MISMATCH'
      ) {
        await clearFailedPaymentRecord(input);
      }
      throw error;
    }
    if (isUniqueConstraintError(error)) {
      const target = uniqueTarget(error);
      const isVisitConflict = target.some(
        (entry) =>
          entry.includes('customerId') ||
          entry.includes('businessDate') ||
          entry.includes('phoneHash')
      );

      if (target.some((entry) => entry.includes('idempotencyKey'))) {
        const batch = await prisma.paymentBatch.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (batch) {
          assertReplayMatches(batch, requestHash, input);
          return {
            replayed: true,
            response: batch.response as Record<string, unknown>,
          };
        }
      }

      if (!isVisitConflict) {
        // A receipt-number collision or an unexpected unique conflict must not
        // be reported as "already counted".
        throw error;
      }

      // A live visit/card unique conflict means "already counted": no charge,
      // no partial benefit. The whole transaction rolled back.
      if (claim.created) {
        await clearFailedPaymentRecord(input);
      }
      throw new LoyaltyPaymentError(
        'Today’s visit is already counted. Reload the bill before taking payment.',
        'BILL_CHANGED',
        409
      );
    }
    throw error;
  }
}

function offlineBusinessDate(
  orders: readonly PaymentOrderRow[],
  clock: { timezone: string; closeTime: string },
  now: Date
): { businessDate: Date; fallback: boolean } {
  const captured = orders
    .map((order) => order.offlineCreatedAt)
    .filter((date): date is Date => date instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0];

  if (captured) {
    return {
      businessDate: toDbBusinessDate(getBusinessDate(captured, clock)),
      fallback: false,
    };
  }

  return {
    businessDate: toDbBusinessDate(getBusinessDate(now, clock)),
    fallback: true,
  };
}

export async function processLoyaltyTablePayment(
  input: LoyaltyTablePaymentInput
): Promise<LoyaltyPaymentResult> {
  return processLoyaltyPayment(input);
}

export async function processLoyaltyOrderPayment(
  input: LoyaltyOrderPaymentInput
): Promise<LoyaltyPaymentResult> {
  return processLoyaltyPayment(input);
}

/** Re-exported for tests that need the exact hash used by the replay store. */
export function buildLoyaltyPaymentRequestHash(
  input: LoyaltyPaymentBaseInput
): string {
  return paymentRequestHash(input);
}
