/**
 * QR loyalty orchestration.
 *
 * The routes stay thin: this module resolves the current cart/session bill,
 * evaluates promotions and the projected reward with the P2 engine, and
 * prepares the `ORDER_CREATE` idempotency record. All money and visit decisions
 * live here, not in `src/app/api/**` (§18.20.5, §18.20.14 C/G, §18.20.15 B/E).
 */

import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, type TransactionClient } from '@/lib/database';
import { isLoyaltyActive, isLoyaltyGloballyEnabled } from '@/lib/loyalty/flags';
import { resolveNotice } from '@/lib/loyalty/consent';
import { hashPhone, normalisePhone } from '@/lib/loyalty/phone';
import {
  evaluatePromotion,
  type PromotionCandidate,
  type PromotionLine,
  type PromotionResult,
  type PromotionScope,
} from '@/lib/loyalty/promotion';
import {
  allocateReward,
  projectReward,
  type RewardCardSnapshot,
  type RewardRule,
  type RewardType,
} from '@/lib/loyalty/reward';
import {
  recomputeOrderTotals,
  type RecomputedOrderTotals,
} from '@/lib/loyalty/tax';
import { resolveVisitState, type VisitState } from '@/lib/loyalty/visit';
import { buildQuoteMessage, type LoyaltyCopyItem } from '@/lib/loyalty/message';
import {
  round5,
  sumMoney,
  toMoneyString,
  type MoneyInput,
} from '@/lib/loyalty/money';
import {
  cartHash,
  getQuote,
  issueQuote,
  type CartLine,
  type QuoteView,
} from '@/lib/services/loyalty-quote-service';
import { resolveOrCreateCustomer } from '@/lib/services/loyalty-customer-service';
import { getBusinessDate, toDbBusinessDate } from '@/lib/time/business-day';

/** The synthetic order id used for the not-yet-created cart order. */
export const CART_ORDER_ID = '__cart__';

/** Why a create fell back to a guest order. */
export type GuestReason =
  | 'NO_PHONE'
  | 'PHONE_INVALID'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_VERSION_REQUIRED'
  | 'CONSENT_STALE'
  | 'MEMBER_RESOLUTION_FAILED';

export interface QrCartItem {
  menuItemId: string;
  quantity: number;
  unitPrice: MoneyInput;
  subtotal: MoneyInput;
  selectedOptions?: readonly { id: string }[] | null;
}

/** Map cart rows to the canonical quote binding lines. */
export function cartLinesFromItems(items: readonly QrCartItem[]): CartLine[] {
  return items.map((item) => ({
    itemId: item.menuItemId,
    quantity: item.quantity,
    optionIds: (item.selectedOptions ?? []).map((option) => option.id),
    unitPrice: item.unitPrice,
  }));
}

export function cartSubtotal(items: readonly QrCartItem[]): Decimal {
  return sumMoney(items.map((item) => item.subtotal));
}

interface PromotionRow {
  id: string;
  name: string;
  receiptLabel: string;
  type: RewardType;
  value: MoneyInput;
  scope: PromotionScope;
  minSpend: MoneyInput;
  maxDiscount: MoneyInput;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  promotionCategories: readonly { categoryId: string }[];
  promotionItems: readonly { itemId: string }[];
}

export function toPromotionCandidate(row: PromotionRow): PromotionCandidate {
  return {
    id: row.id,
    name: row.name,
    receiptLabel: row.receiptLabel,
    type: row.type,
    value: row.value,
    scope: row.scope,
    categoryIds: row.promotionCategories.map((entry) => entry.categoryId),
    itemIds: row.promotionItems.map((entry) => entry.itemId),
    minSpend: row.minSpend,
    maxDiscount: row.maxDiscount,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isActive: row.isActive,
  };
}

export interface BillOrderInput {
  orderId: string;
  subtotal: MoneyInput;
  taxRate: MoneyInput;
  serviceRate: MoneyInput;
  lines: readonly PromotionLine[];
}

export interface ComputeBillQuoteInput {
  orders: readonly BillOrderInput[];
  promotions: readonly PromotionCandidate[];
  settings: RewardRule;
  card: RewardCardSnapshot | null;
  hasMember: boolean;
  hasConsent: boolean;
  alreadyCounted: boolean;
  daySubtotal: MoneyInput;
  cashRounding?: 'NONE' | 'NEAREST_5_SEN' | null;
  billRevision?: number;
  guestReason?: GuestReason | null;
  currency?: string;
  now: Date;
}

export interface BillDiscountLine {
  source: 'PROMOTION' | 'LOYALTY_REWARD';
  label: string;
  amount: Decimal;
}

export interface CartPromotion {
  promotion: PromotionCandidate;
  result: PromotionResult;
}

export interface BillQuoteComputation {
  billRevision: number;
  subtotal: Decimal;
  promotionDiscountAmount: Decimal;
  projectedRewardAmount: Decimal;
  discountAmount: Decimal;
  discountLines: BillDiscountLine[];
  discountedSubtotal: Decimal;
  taxAmount: Decimal;
  serviceCharge: Decimal;
  totalAmount: Decimal;
  projectedTotal: Decimal;
  cashPayable: Decimal;
  rewardLabel: string | null;
  rewardType: RewardType;
  rewardValue: string;
  maxDiscount: Decimal;
  promotionApplied: boolean;
  promotionScope: PromotionScope | 'MULTIPLE' | null;
  promotionLabel: string | null;
  promotionItems: LoyaltyCopyItem[];
  promotionIds: string[];
  visitState: VisitState;
  completedVisits: number;
  visitsRequired: number;
  cartPromotion: CartPromotion | null;
  /** The cart order before the projected reward is written (order create). */
  cartPreRewardTotals: RecomputedOrderTotals;
  /** The cart order as projected at payment (quote totals). */
  cartProjectedTotals: RecomputedOrderTotals;
  message: string | null;
}

function rewardValueText(rule: RewardRule): string {
  return rule.rewardType === 'PERCENT'
    ? new Decimal(rule.rewardValue).toFixed(0)
    : toMoneyString(rule.rewardValue);
}

function rewardItems(
  evaluated: readonly { result: PromotionResult }[]
): LoyaltyCopyItem[] {
  const items = new Map<string, LoyaltyCopyItem>();
  for (const entry of evaluated) {
    for (const item of entry.result.items) {
      items.set(item.itemId, { itemId: item.itemId, name: item.name });
    }
  }
  return [...items.values()];
}

/**
 * Pure bill pricing for the QR quote. The caller supplies the current unpaid
 * bill orders plus the cart as one synthetic order.
 */
export function computeBillQuote(
  input: ComputeBillQuoteInput
): BillQuoteComputation {
  const evaluated = input.orders.map((order) => ({
    order,
    result: evaluatePromotion({
      lines: order.lines,
      promotions: input.promotions,
      at: input.now,
    }),
  }));

  const promotionApplied = evaluated.some((entry) => entry.result.applied);
  const promotionDiscountAmount = sumMoney(
    evaluated.map((entry) =>
      entry.result.applied ? entry.result.discountAmount : 0
    )
  );

  const subtotal = sumMoney(input.orders.map((order) => order.subtotal));
  const rule = input.card ?? input.settings;
  const visitState = resolveVisitState({
    hasMember: input.hasMember,
    hasConsent: input.hasConsent,
    hasPromotion: promotionApplied,
    alreadyCounted: input.alreadyCounted,
    daySubtotal: input.daySubtotal,
    minDailySpend: rule.minDailySpend,
  });

  const reward =
    visitState === 'COUNTS'
      ? projectReward({
          subtotal,
          card: input.card,
          settings: input.settings,
          hasPromotion: promotionApplied,
        })
      : {
          amount: new Decimal(0),
          applies: false,
          label: rule.rewardLabel,
          visitsRequired: rule.visitsRequired,
          completedVisits: input.card?.visitsInCycle ?? 0,
        };

  const projectedRewardAmount = reward.applies ? reward.amount : new Decimal(0);

  const allocations =
    projectedRewardAmount.gt(0) && input.orders.length > 0
      ? allocateReward({
          rewardAmount: projectedRewardAmount,
          orders: input.orders.map((order) => ({
            orderId: order.orderId,
            subtotal: order.subtotal,
          })),
        })
      : input.orders.map((order) => ({
          orderId: order.orderId,
          amount: new Decimal(0),
        }));

  const allocationByOrder = new Map(
    allocations.map((entry) => [entry.orderId, entry.amount])
  );

  const priced = evaluated.map((entry) => {
    const promotionDiscount = entry.result.applied
      ? entry.result.discountAmount
      : new Decimal(0);
    const rewardAllocation =
      allocationByOrder.get(entry.order.orderId) ?? new Decimal(0);

    return {
      order: entry.order,
      result: entry.result,
      promotionDiscount,
      rewardAllocation,
      preRewardTotals: recomputeOrderTotals({
        subtotal: entry.order.subtotal,
        discountAmount: promotionDiscount,
        taxRate: entry.order.taxRate,
        serviceRate: entry.order.serviceRate,
      }),
      projectedTotals: recomputeOrderTotals({
        subtotal: entry.order.subtotal,
        discountAmount: promotionDiscount.plus(rewardAllocation),
        taxRate: entry.order.taxRate,
        serviceRate: entry.order.serviceRate,
      }),
    };
  });

  const discountLines: BillDiscountLine[] = [];
  for (const entry of priced) {
    if (entry.result.applied) {
      discountLines.push({
        source: 'PROMOTION',
        label: entry.result.label ?? entry.result.promotionName ?? 'Promotion',
        amount: entry.promotionDiscount,
      });
    }
  }
  for (const entry of priced) {
    if (entry.rewardAllocation.gt(0)) {
      discountLines.push({
        source: 'LOYALTY_REWARD',
        label: reward.label,
        amount: entry.rewardAllocation,
      });
    }
  }

  const applied = priced.filter((entry) => entry.result.applied);
  const distinctPromotionIds = new Set(
    applied.map((entry) => entry.result.promotionId)
  );
  const distinctScopes = new Set(applied.map((entry) => entry.result.scope));
  const distinctLabels = new Set(applied.map((entry) => entry.result.label));

  const isMultiple =
    applied.length > 0 &&
    (distinctPromotionIds.size > 1 ||
      distinctScopes.size > 1 ||
      distinctLabels.size > 1);

  const promotionScope: PromotionScope | 'MULTIPLE' | null =
    applied.length === 0
      ? null
      : isMultiple
        ? 'MULTIPLE'
        : (applied[0].result.scope as PromotionScope);
  const promotionLabel =
    applied.length === 0
      ? null
      : isMultiple
        ? 'Promotions'
        : applied[0].result.label;

  const cartEntry = priced.find(
    (entry) => entry.order.orderId === CART_ORDER_ID
  );
  if (!cartEntry) {
    throw new Error('The cart order is missing from the quote');
  }

  const cartPromotion =
    cartEntry.result.applied &&
    cartEntry.result.promotionId !== null &&
    cartEntry.result.scope !== null
      ? {
          promotion: input.promotions.find(
            (promotion) => promotion.id === cartEntry.result.promotionId
          ) as PromotionCandidate,
          result: cartEntry.result,
        }
      : null;

  const taxAmount = sumMoney(
    priced.map((entry) => entry.projectedTotals.taxAmount)
  );
  const serviceCharge = sumMoney(
    priced.map((entry) => entry.projectedTotals.serviceCharge)
  );
  const discountedSubtotal = sumMoney(
    priced.map((entry) => entry.projectedTotals.discountedSubtotal)
  );
  const totalAmount = sumMoney(
    priced.map((entry) => entry.projectedTotals.totalAmount)
  );
  const discountAmount = promotionDiscountAmount.plus(projectedRewardAmount);
  const cashPayable =
    input.cashRounding === 'NEAREST_5_SEN' ? round5(totalAmount) : totalAmount;

  const message = buildQuoteMessage({
    visitState,
    completedVisits: input.card?.visitsInCycle ?? 0,
    visitsRequired: rule.visitsRequired,
    rewardLabel: reward.label,
    rewardApplied: projectedRewardAmount.gt(0),
    promotionScope: promotionScope ?? undefined,
    promotionLabel: promotionLabel ?? undefined,
    promotionItems: rewardItems(applied),
    noPhone: input.guestReason === 'NO_PHONE',
    loyaltyErrorCode:
      input.guestReason && input.guestReason !== 'NO_PHONE'
        ? input.guestReason
        : null,
    currency: input.currency,
  });

  return {
    billRevision: input.billRevision ?? 0,
    subtotal,
    promotionDiscountAmount,
    projectedRewardAmount,
    discountAmount,
    discountLines,
    discountedSubtotal,
    taxAmount,
    serviceCharge,
    totalAmount,
    projectedTotal: totalAmount,
    cashPayable,
    rewardLabel: reward.label,
    rewardType: rule.rewardType,
    rewardValue: rewardValueText(rule),
    maxDiscount: new Decimal(rule.maxDiscount),
    promotionApplied,
    promotionScope,
    promotionLabel,
    promotionItems: rewardItems(applied),
    promotionIds: [
      ...new Set(
        applied
          .map((entry) => entry.result.promotionId)
          .filter((id): id is string => id !== null)
      ),
    ],
    visitState,
    completedVisits: input.card?.visitsInCycle ?? 0,
    visitsRequired: rule.visitsRequired,
    cartPromotion,
    cartPreRewardTotals: cartEntry.preRewardTotals,
    cartProjectedTotals: cartEntry.projectedTotals,
    message,
  };
}

export interface RepriceQrBillInput {
  restaurantId: string;
  tableId: string;
  sessionId: string;
  cart: { items: readonly QrCartItem[] };
  customerId?: string | null;
  phoneHash?: string | null;
  guestReason?: GuestReason | null;
  now?: Date;
}

interface QrRestaurantRow {
  id: string;
  currency: string;
  taxRate: MoneyInput;
  serviceChargeRate: MoneyInput;
  timezone: string;
  businessDayCloseTime: string;
  cashRounding: 'NONE' | 'NEAREST_5_SEN' | null;
}

function rewardRuleFromSettings(row: {
  visitsRequired: number;
  rewardType: RewardType;
  rewardValue: MoneyInput;
  maxDiscount: MoneyInput;
  rewardLabel: string;
  minDailySpend: MoneyInput;
}): RewardRule {
  return {
    visitsRequired: row.visitsRequired,
    rewardType: row.rewardType,
    rewardValue: row.rewardValue,
    maxDiscount: row.maxDiscount,
    rewardLabel: row.rewardLabel,
    minDailySpend: row.minDailySpend,
  };
}

/**
 * Load the current bill and price it for the QR review screen.
 *
 * The bill is every unpaid, non-cancelled order in the open dining session plus
 * the current cart. A member is resolved by the caller; this function only
 * reads the card/visit/day state for that member.
 */
export async function repriceQrBill(
  input: RepriceQrBillInput
): Promise<BillQuoteComputation> {
  const now = input.now ?? new Date();
  const restaurant = (await prisma.restaurant.findUnique({
    where: { id: input.restaurantId },
    select: {
      id: true,
      currency: true,
      taxRate: true,
      serviceChargeRate: true,
      timezone: true,
      businessDayCloseTime: true,
      cashRounding: true,
    },
  })) as QrRestaurantRow | null;

  if (!restaurant) {
    throw new Error('Restaurant not found for the loyalty quote');
  }

  const settingsRow = await prisma.loyaltySettings.findUnique({
    where: { restaurantId: input.restaurantId },
  });
  if (!settingsRow) {
    throw new Error('Loyalty settings not found for the quote');
  }

  const session = await prisma.diningSession.findFirst({
    where: {
      restaurantId: input.restaurantId,
      tableId: input.tableId,
      status: 'OPEN',
    },
    orderBy: { openedAt: 'desc' },
    select: { id: true, billRevision: true },
  });

  const orders = session
    ? await prisma.order.findMany({
        where: {
          restaurantId: input.restaurantId,
          diningSessionId: session.id,
          paymentStatus: 'PENDING',
          status: { not: 'CANCELLED' },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          subtotalAmount: true,
          taxRateSnapshot: true,
          serviceChargeRateSnapshot: true,
          items: {
            select: {
              menuItemId: true,
              totalAmount: true,
              menuItem: {
                select: { id: true, name: true, categoryId: true },
              },
            },
          },
        },
      })
    : [];

  const promotionRows = (await prisma.promotion.findMany({
    where: {
      restaurantId: input.restaurantId,
      isActive: true,
      deletedAt: null,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    include: {
      promotionCategories: { select: { categoryId: true } },
      promotionItems: { select: { itemId: true } },
    },
  })) as PromotionRow[];
  const promotions = promotionRows.map(toPromotionCandidate);

  const cartMenuItemIds = [
    ...new Set(input.cart.items.map((item) => item.menuItemId)),
  ];
  const cartMenuItems = cartMenuItemIds.length
    ? await prisma.menuItem.findMany({
        where: {
          restaurantId: input.restaurantId,
          id: { in: cartMenuItemIds },
        },
        select: { id: true, name: true, categoryId: true },
      })
    : [];
  const menuItemById = new Map(cartMenuItems.map((item) => [item.id, item]));

  const cartLines: PromotionLine[] = input.cart.items.map((item) => {
    const menuItem = menuItemById.get(item.menuItemId);
    if (!menuItem) {
      throw new Error('Cart menu item not found for the quote');
    }
    return {
      itemId: item.menuItemId,
      categoryId: menuItem.categoryId,
      name: menuItem.name,
      lineTotal: item.subtotal,
    };
  });

  const billOrders: BillOrderInput[] = orders.map((order) => ({
    orderId: order.id,
    subtotal: order.subtotalAmount,
    taxRate: order.taxRateSnapshot,
    serviceRate: order.serviceChargeRateSnapshot,
    lines: order.items.map((item) => ({
      itemId: item.menuItemId,
      categoryId: item.menuItem.categoryId,
      name: item.menuItem.name,
      lineTotal: item.totalAmount,
    })),
  }));

  billOrders.push({
    orderId: CART_ORDER_ID,
    subtotal: cartSubtotal(input.cart.items),
    taxRate: restaurant.taxRate,
    serviceRate: restaurant.serviceChargeRate,
    lines: cartLines,
  });

  const customerId = input.customerId ?? null;
  const cardRow =
    customerId === null
      ? null
      : await prisma.loyaltyCard.findUnique({
          where: {
            restaurantId_customerId: {
              restaurantId: input.restaurantId,
              customerId,
            },
          },
        });

  const card: RewardCardSnapshot | null = cardRow
    ? {
        visitsInCycle: cardRow.visitsInCycle,
        cycleNumber: cardRow.cycleNumber,
        visitsRequired: cardRow.visitsRequired,
        rewardType: cardRow.rewardType,
        rewardValue: cardRow.rewardValue,
        maxDiscount: cardRow.maxDiscount,
        rewardLabel: cardRow.rewardLabel,
        minDailySpend: cardRow.minDailySpend,
      }
    : null;

  const clock = {
    timezone: restaurant.timezone || 'Asia/Kuala_Lumpur',
    closeTime: restaurant.businessDayCloseTime || '04:00',
  };
  const businessDate = getBusinessDate(now, clock);
  const dbBusinessDate = toDbBusinessDate(businessDate);

  const visit =
    customerId === null
      ? null
      : await prisma.loyaltyVisit.findFirst({
          where: {
            restaurantId: input.restaurantId,
            customerId,
            businessDate: dbBusinessDate,
          },
          select: { id: true },
        });

  const billSubtotal = sumMoney(billOrders.map((order) => order.subtotal));

  let paidSubtotal = new Decimal(0);
  if (customerId !== null) {
    const batches = await prisma.paymentBatch.findMany({
      where: {
        restaurantId: input.restaurantId,
        businessDate: dbBusinessDate,
      },
      select: {
        payments: {
          select: {
            order: {
              select: {
                id: true,
                customerId: true,
                status: true,
                paymentStatus: true,
                subtotalAmount: true,
              },
            },
          },
        },
      },
    });

    const counted = new Set<string>();
    for (const batch of batches) {
      for (const payment of batch.payments) {
        const order = payment.order;
        if (!order || counted.has(order.id)) continue;
        if (order.customerId !== customerId) continue;
        if (order.status === 'CANCELLED') continue;
        if (order.paymentStatus === 'REFUNDED') continue;
        counted.add(order.id);
        paidSubtotal = paidSubtotal.plus(order.subtotalAmount);
      }
    }
  }

  return computeBillQuote({
    orders: billOrders,
    promotions,
    settings: rewardRuleFromSettings(settingsRow),
    card,
    hasMember: customerId !== null,
    hasConsent: customerId !== null,
    alreadyCounted: visit !== null,
    daySubtotal: paidSubtotal.plus(billSubtotal),
    cashRounding: restaurant.cashRounding,
    billRevision: session?.billRevision ?? 0,
    guestReason: input.guestReason ?? null,
    currency: restaurant.currency,
    now,
  });
}

export interface IssueQrQuoteInput extends RepriceQrBillInput {
  tableId: string;
  sessionId: string;
  customerId: string | null;
  phoneHash: string | null;
}

export interface QrQuoteResult {
  quoteId: string;
  expiresAt: Date;
  computation: BillQuoteComputation;
}

/** Price the bill and persist the 10-minute single-use quote. */
export async function issueQrQuote(
  input: IssueQrQuoteInput
): Promise<QrQuoteResult> {
  const now = input.now ?? new Date();
  const computation = await repriceQrBill({ ...input, now });
  const issued = await issueQuote({
    restaurantId: input.restaurantId,
    lines: cartLinesFromItems(input.cart.items),
    pricing: {
      subtotal: computation.subtotal,
      promotionDiscountAmount: computation.promotionDiscountAmount,
      projectedRewardAmount: computation.projectedRewardAmount,
      discountAmount: computation.discountAmount,
      taxAmount: computation.taxAmount,
      serviceCharge: computation.serviceCharge,
      totalAmount: computation.totalAmount,
      projectedTotal: computation.projectedTotal,
      cashPayable: computation.cashPayable,
      visitState: computation.visitState,
      rewardLabel: computation.rewardLabel,
    },
    billRevision: computation.billRevision,
    tableId: input.tableId,
    sessionId: input.sessionId,
    customerId: input.customerId,
    phoneHash: input.phoneHash,
    promotionIds: computation.promotionIds,
    now,
  });

  return { ...issued, computation };
}

// ============================================================================
// ORDER_CREATE idempotency
// ============================================================================

export const ORDER_CREATE_SCOPE = 'ORDER_CREATE';
export const ORDER_CREATE_IN_PROGRESS_MS = 5 * 60 * 1000;
export const ORDER_CREATE_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface OrderCreateRecord {
  status: 'IN_PROGRESS' | 'COMPLETED';
  requestHash: string;
  responseJson: Prisma.JsonValue | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface OrderCreateRequestHashInput {
  restaurantId: string;
  tableId: string;
  sessionId: string | null;
  quoteId: string;
  expectedTotal: string;
  customerInfo?: LoyaltyCreateCustomerInfo | null;
}

/**
 * Stable hash of the client-visible create request.
 *
 * It deliberately excludes the server-side cart hash and resolved member id:
 * the early idempotency replay runs before the cart is read, and the cart /
 * member binding is enforced by `consumeQuote` on the first create. The
 * client-visible fields are enough to reject a key reused with a different
 * body (`IDEMPOTENCY_MISMATCH`).
 *
 * F-08: the digest is keyed with `LOYALTY_PHONE_HMAC_KEY` (`hashPhone`), not an
 * unkeyed SHA-256. The payload contains a low-entropy phone number, so an
 * unkeyed digest persisted for 24 hours is brute-forceable. The keyed HMAC is
 * useless without the server secret and still changes when the body changes.
 */
export function orderCreateRequestHash(
  input: OrderCreateRequestHashInput
): string {
  const payload = JSON.stringify({
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    sessionId: input.sessionId ?? null,
    quoteId: input.quoteId,
    expectedTotal: input.expectedTotal,
    customerInfo: {
      name: input.customerInfo?.name ?? null,
      phone: input.customerInfo?.phone ?? null,
      email: input.customerInfo?.email ?? null,
      consent: input.customerInfo?.consent ?? null,
      consentVersion: input.customerInfo?.consentVersion ?? null,
      consentTextHash: input.customerInfo?.consentTextHash ?? null,
    },
  });
  return hashPhone(payload);
}

export async function findOrderCreateRecord(
  restaurantId: string,
  key: string,
  now: Date = new Date()
): Promise<OrderCreateRecord | null> {
  // `findUnique` cannot express the retention predicate, so use a scoped
  // `findFirst` with the same unique fields plus `expiresAt > now`. An expired
  // record is treated as absent (§18.20.14 F/G, 24-hour retention).
  const record = await prisma.idempotencyRecord.findFirst({
    where: {
      restaurantId,
      scope: ORDER_CREATE_SCOPE,
      key,
      expiresAt: { gt: now },
    },
    select: {
      status: true,
      requestHash: true,
      responseJson: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return record
    ? {
        status: record.status,
        requestHash: record.requestHash,
        responseJson: record.responseJson,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      }
    : null;
}

/** Remove a stale IN_PROGRESS record so the caller can take over safely. */
export async function clearStaleOrderCreateRecord(
  restaurantId: string,
  key: string,
  now: Date = new Date()
): Promise<void> {
  const cutoff = new Date(now.getTime() - ORDER_CREATE_IN_PROGRESS_MS);
  await prisma.idempotencyRecord.deleteMany({
    where: {
      restaurantId,
      scope: ORDER_CREATE_SCOPE,
      key,
      status: 'IN_PROGRESS',
      createdAt: { lt: cutoff },
    },
  });
}

export async function startOrderCreateRecord(
  tx: TransactionClient,
  input: {
    restaurantId: string;
    key: string;
    requestHash: string;
    now?: Date;
  }
): Promise<void> {
  const now = input.now ?? new Date();
  await tx.idempotencyRecord.create({
    data: {
      restaurantId: input.restaurantId,
      scope: ORDER_CREATE_SCOPE,
      key: input.key,
      requestHash: input.requestHash,
      status: 'IN_PROGRESS',
      createdAt: now,
      expiresAt: new Date(now.getTime() + ORDER_CREATE_RETENTION_MS),
    },
  });
}

export async function completeOrderCreateRecord(
  tx: TransactionClient,
  input: {
    restaurantId: string;
    key: string;
    response: Prisma.InputJsonValue;
  }
): Promise<void> {
  await tx.idempotencyRecord.update({
    where: {
      restaurantId_scope_key: {
        restaurantId: input.restaurantId,
        scope: ORDER_CREATE_SCOPE,
        key: input.key,
      },
    },
    data: {
      status: 'COMPLETED',
      responseJson: input.response,
    },
  });
}

// ============================================================================
// Create preparation
// ============================================================================

export interface LoyaltyCreateCustomerInfo {
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  consent?: boolean;
  consentVersion?: string | null;
  consentTextHash?: string | null;
}

export interface PrepareLoyaltyCreateInput {
  restaurantId: string;
  tableId: string;
  sessionId: string;
  /**
   * The session id exactly as sent by the client, for the idempotency request
   * hash. `sessionId` is the server-resolved cart session and may differ when
   * the client omitted it.
   */
  requestSessionId?: string | null;
  cart: { items: readonly QrCartItem[] };
  customerInfo?: LoyaltyCreateCustomerInfo | null;
  quoteId?: string | null;
  expectedTotal?: string | null;
  idempotencyKey?: string | null;
  now?: Date;
}

export interface LoyaltyCreatePlan {
  quote: QuoteView;
  computation: BillQuoteComputation;
  customerId: string | null;
  phoneHash: string | null;
  guestError: { code: string; message: string } | null;
  expectedTotal: string;
  cartHash: string;
  idempotencyKey: string | null;
  requestHash: string | null;
  cartPromotion: CartPromotion | null;
  cartPreRewardTotals: RecomputedOrderTotals;
}

export type PrepareLoyaltyCreateResult =
  | { kind: 'legacy' }
  | { kind: 'error'; status: number; code: string; message: string }
  | { kind: 'replay'; status: number; body: Prisma.JsonValue }
  | { kind: 'ready'; plan: LoyaltyCreatePlan };

const QUOTE_CHANGED_MESSAGE =
  'The quote is no longer valid. Request a new quote.';

/** A 2dp money string at the API boundary (REVIEW-05 F-03). */
const MoneyStringSchema = z.string().regex(/^(0|[1-9]\d{0,8})\.\d{2}$/);

function quoteChanged(): PrepareLoyaltyCreateResult {
  return {
    kind: 'error',
    status: 409,
    code: 'QUOTE_CHANGED',
    message: QUOTE_CHANGED_MESSAGE,
  };
}

function idempotencyMismatch(): PrepareLoyaltyCreateResult {
  return {
    kind: 'error',
    status: 409,
    code: 'IDEMPOTENCY_MISMATCH',
    message: 'This idempotency key was used for a different request.',
  };
}

function storedOrderIdFromJson(body: Prisma.JsonValue | null): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const order = (body as Record<string, unknown>).order;
  if (!order || typeof order !== 'object' || Array.isArray(order)) return null;
  const id = (order as Record<string, unknown>).id;
  return typeof id === 'string' ? id : null;
}

/**
 * Build the QR `loyaltyError` for a guest fallback.
 *
 * A customer who simply did not enter a phone is not making an error: the
 * order is a normal guest order and the QR shows the notice prompt. Only an
 * actually invalid phone, missing consent, stale consent or an internal
 * member-resolution failure emits `loyaltyError` (§18.20.12/§18.20.13).
 */
export function guestErrorFor(
  reason: GuestReason | null
): { code: string; message: string } | null {
  if (!reason || reason === 'NO_PHONE') return null;

  if (reason === 'MEMBER_RESOLUTION_FAILED') {
    return {
      code: 'LOYALTY_DISABLED',
      message:
        buildQuoteMessage({
          visitState: 'GUEST',
          loyaltyErrorCode: 'MEMBER_RESOLUTION_FAILED',
        }) ?? 'Could not add rewards. Staff can help at the counter.',
    };
  }

  const code =
    reason === 'CONSENT_VERSION_REQUIRED' ? 'CONSENT_REQUIRED' : reason;

  return {
    code,
    message:
      buildQuoteMessage({
        visitState: 'GUEST',
        loyaltyErrorCode: code,
      }) ?? 'Could not add rewards. Staff can help at the counter.',
  };
}

function sameMoney(left: MoneyInput, right: MoneyInput): boolean {
  return new Decimal(left).eq(new Decimal(right));
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

/**
 * Compare a stored quote with a fresh reprice. Any drift is `QUOTE_CHANGED`;
 * the quote is a projection and order create is the definitive lock point.
 */
export function quoteMatchesComputation(
  quote: QuoteView,
  computation: BillQuoteComputation
): boolean {
  return (
    quote.billRevision === computation.billRevision &&
    sameMoney(quote.subtotal, computation.subtotal) &&
    sameMoney(
      quote.promotionDiscountAmount,
      computation.promotionDiscountAmount
    ) &&
    sameMoney(quote.projectedRewardAmount, computation.projectedRewardAmount) &&
    sameMoney(quote.discountAmount, computation.discountAmount) &&
    sameMoney(quote.taxAmount, computation.taxAmount) &&
    sameMoney(quote.serviceCharge, computation.serviceCharge) &&
    sameMoney(quote.totalAmount, computation.totalAmount) &&
    sameMoney(quote.projectedTotal, computation.projectedTotal) &&
    sameMoney(quote.cashPayable, computation.cashPayable) &&
    quote.visitState === computation.visitState &&
    sameStringSet(quote.promotionIds, computation.promotionIds) &&
    (quote.rewardLabel ?? null) === (computation.rewardLabel ?? null)
  );
}

async function resolveMember(
  restaurantId: string,
  notice: ReturnType<typeof resolveNotice>,
  customerInfo: LoyaltyCreateCustomerInfo | null | undefined
): Promise<{
  customerId: string | null;
  phoneHash: string | null;
  guestReason: GuestReason | null;
}> {
  const phone = customerInfo?.phone ?? null;

  if (!phone) {
    return {
      customerId: null,
      phoneHash: null,
      guestReason: 'NO_PHONE',
    };
  }

  if (customerInfo?.consent !== true) {
    return {
      customerId: null,
      phoneHash: null,
      guestReason: 'CONSENT_REQUIRED',
    };
  }

  const resolved = await resolveOrCreateCustomer({
    restaurantId,
    phone,
    consent: {
      clientVersion: customerInfo?.consentVersion ?? null,
      clientTextHash: customerInfo?.consentTextHash ?? null,
    },
    notice,
    name: customerInfo?.name ?? null,
    source: 'QR',
  });

  if (!resolved.customerId) {
    const code = resolved.loyaltyError?.code;
    const guestReason: GuestReason =
      code === 'PHONE_INVALID' ||
      code === 'CONSENT_REQUIRED' ||
      code === 'CONSENT_VERSION_REQUIRED' ||
      code === 'CONSENT_STALE'
        ? code
        : 'MEMBER_RESOLUTION_FAILED';

    return { customerId: null, phoneHash: null, guestReason };
  }

  const normalised = normalisePhone(phone);
  if (!normalised.ok) {
    return {
      customerId: null,
      phoneHash: null,
      guestReason: 'PHONE_INVALID',
    };
  }

  try {
    return {
      customerId: resolved.customerId,
      phoneHash: hashPhone(normalised.phone),
      guestReason: null,
    };
  } catch {
    return {
      customerId: null,
      phoneHash: null,
      guestReason: 'MEMBER_RESOLUTION_FAILED',
    };
  }
}

/**
 * Prepare a loyalty-aware QR order create.
 *
 * Returns `legacy` whenever loyalty is inactive or the request has no quote, so
 * the create route keeps its pre-P4 behaviour byte-for-byte.
 */
export async function prepareLoyaltyCreate(
  input: PrepareLoyaltyCreateInput
): Promise<PrepareLoyaltyCreateResult> {
  if (!input.quoteId || !isLoyaltyGloballyEnabled()) {
    return { kind: 'legacy' };
  }

  const settings = await prisma.loyaltySettings.findUnique({
    where: { restaurantId: input.restaurantId },
  });
  if (!isLoyaltyActive(settings)) {
    return { kind: 'legacy' };
  }

  const notice = resolveNotice(settings);
  if (!notice) {
    return { kind: 'legacy' };
  }

  const expectedTotal = input.expectedTotal ?? null;
  if (
    expectedTotal === null ||
    !MoneyStringSchema.safeParse(expectedTotal).success
  ) {
    return quoteChanged();
  }

  const now = input.now ?? new Date();

  const quote = await getQuote({
    restaurantId: input.restaurantId,
    quoteId: input.quoteId,
    sessionId: input.sessionId,
    tableId: input.tableId,
  });
  if (!quote) return quoteChanged();
  if (quote.consumedAt !== null) return quoteChanged();
  if (now.getTime() >= new Date(quote.expiresAt).getTime()) {
    return quoteChanged();
  }

  const member = await resolveMember(
    input.restaurantId,
    notice,
    input.customerInfo
  );

  const computation = await repriceQrBill({
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    sessionId: input.sessionId,
    cart: input.cart,
    customerId: member.customerId,
    phoneHash: member.phoneHash,
    guestReason: member.guestReason,
    now,
  });

  if (!quoteMatchesComputation(quote, computation)) {
    return quoteChanged();
  }

  const hash = cartHash(cartLinesFromItems(input.cart.items));
  const requestHash = input.idempotencyKey
    ? orderCreateRequestHash({
        restaurantId: input.restaurantId,
        tableId: input.tableId,
        sessionId: input.requestSessionId ?? input.sessionId,
        quoteId: input.quoteId,
        expectedTotal,
        customerInfo: input.customerInfo,
      })
    : null;

  if (input.idempotencyKey && requestHash) {
    const existing = await findOrderCreateRecord(
      input.restaurantId,
      input.idempotencyKey,
      now
    );

    if (existing) {
      if (existing.requestHash !== requestHash) {
        return idempotencyMismatch();
      }

      if (existing.status === 'COMPLETED') {
        if (
          quote.orderId === null ||
          storedOrderIdFromJson(existing.responseJson) !== quote.orderId
        ) {
          return idempotencyMismatch();
        }
        return {
          kind: 'replay',
          status: 200,
          body: existing.responseJson ?? {
            success: false,
            error: 'The original response is no longer available.',
            code: 'IDEMPOTENCY_MISMATCH',
          },
        };
      }

      const age = now.getTime() - new Date(existing.createdAt).getTime();
      if (age < ORDER_CREATE_IN_PROGRESS_MS) {
        return {
          kind: 'error',
          status: 409,
          code: 'IDEMPOTENCY_MISMATCH',
          message: 'A request with this idempotency key is in progress.',
        };
      }

      await clearStaleOrderCreateRecord(
        input.restaurantId,
        input.idempotencyKey
      );
    }
  }

  return {
    kind: 'ready',
    plan: {
      quote,
      computation,
      customerId: member.customerId,
      phoneHash: member.phoneHash,
      guestError: guestErrorFor(member.guestReason),
      expectedTotal,
      cartHash: hash,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash,
      cartPromotion: computation.cartPromotion,
      cartPreRewardTotals: computation.cartPreRewardTotals,
    },
  };
}

/** A fresh order id for the loyalty path so the quote can be consumed first. */
export function newLoyaltyOrderId(): string {
  return randomUUID();
}
