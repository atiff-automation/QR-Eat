/**
 * Server-issued loyalty quotes.
 *
 * A quote is a 128-bit opaque, single-use price lock for QR order create. It
 * binds the cart, bill revision, member and total; order create validates the
 * binding and consumes it in the same transaction that writes the order
 * (§18.20.14 G, §18.20.15 B/D).
 *
 * `consumeQuote` never opens a transaction of its own: the caller passes its
 * order-create transaction so `consumedAt`/`orderId` commit atomically with the
 * order.
 */

import { createHash, randomBytes } from 'node:crypto';
import Decimal from 'decimal.js';
import { prisma, type TransactionClient } from '@/lib/database';
import { toMoneyString, type MoneyInput } from '@/lib/loyalty/money';
import type { VisitState } from '@/lib/loyalty/visit';

/** Quote lifetime: ten minutes (§18.20.14 G). */
export const QUOTE_TTL_MS = 10 * 60 * 1000;

/** One cart line, as hashed into the quote binding. */
export interface CartLine {
  itemId: string;
  quantity: number;
  optionIds?: readonly string[];
  unitPrice: MoneyInput;
}

/** Pricing outputs produced by the P2 engine. */
export interface QuotePricingInput {
  subtotal: MoneyInput;
  promotionDiscountAmount: MoneyInput;
  projectedRewardAmount: MoneyInput;
  discountAmount: MoneyInput;
  taxAmount: MoneyInput;
  serviceCharge: MoneyInput;
  totalAmount: MoneyInput;
  projectedTotal: MoneyInput;
  cashPayable: MoneyInput;
  visitState: VisitState;
  rewardLabel?: string | null;
}

export interface IssueQuoteInput {
  restaurantId: string;
  lines: readonly CartLine[];
  pricing: QuotePricingInput;
  billRevision: number;
  tableId?: string | null;
  sessionId?: string | null;
  cartKey?: string | null;
  customerId?: string | null;
  phoneHash?: string | null;
  promotionIds?: readonly string[];
  /** Injectable clock for tests. */
  now?: Date;
}

export interface IssueQuoteResult {
  quoteId: string;
  expiresAt: Date;
}

export interface ConsumeQuoteInput {
  restaurantId: string;
  quoteId: string;
  cartHash: string;
  customerId?: string | null;
  phoneHash?: string | null;
  expectedTotal: MoneyInput;
  orderId: string;
  /** Injectable clock for tests. */
  now?: Date;
}

export interface ConsumedQuote {
  quoteId: string;
  customerId: string | null;
  phoneHash: string | null;
  projectedTotal: Decimal;
  cashPayable: Decimal;
}

export type QuoteErrorCode = 'QUOTE_CHANGED';

export type ConsumeQuoteResult =
  | { ok: true; quote: ConsumedQuote }
  | { ok: false; loyaltyError: { code: QuoteErrorCode; message: string } };

export interface GetQuoteInput {
  restaurantId: string;
  quoteId: string;
  sessionId?: string | null;
  tableId?: string | null;
  cartKey?: string | null;
}

export interface QuoteView {
  quoteId: string;
  restaurantId: string;
  tableId: string | null;
  sessionId: string | null;
  cartKey: string | null;
  cartHash: string;
  billRevision: number;
  customerId: string | null;
  phoneHash: string | null;
  promotionIds: string[];
  promotionDiscountAmount: Decimal;
  visitState: VisitState;
  projectedRewardAmount: Decimal;
  rewardLabel: string | null;
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  serviceCharge: Decimal;
  totalAmount: Decimal;
  projectedTotal: Decimal;
  cashPayable: Decimal;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  orderId: string | null;
}

const QUOTE_CHANGED_MESSAGE =
  'The quote is no longer valid. Request a new quote.';

function quoteChanged(): ConsumeQuoteResult {
  return {
    ok: false,
    loyaltyError: { code: 'QUOTE_CHANGED', message: QUOTE_CHANGED_MESSAGE },
  };
}

/**
 * Canonical, order-independent cart digest.
 *
 * Each line is normalised to `{itemId, quantity, optionIds[], unitPrice}` with
 * option ids sorted and the unit price formatted to 2dp. The serialised lines
 * are sorted before hashing, so reordering the cart produces the same digest
 * while changing an item, quantity, option or price produces a different one.
 */
export function cartHash(lines: readonly CartLine[]): string {
  const canonical = lines
    .map((line) =>
      JSON.stringify({
        itemId: line.itemId,
        quantity: line.quantity,
        optionIds: [...(line.optionIds ?? [])].sort(),
        unitPrice: toMoneyString(line.unitPrice),
      })
    )
    .sort();

  return createHash('sha256')
    .update(canonical.join('\n'), 'utf8')
    .digest('hex');
}

/**
 * Mint and persist a quote.
 *
 * The id is 128 bits from `crypto.randomBytes(16)`, base64url encoded. The
 * quote and its `QuotePromotion` join rows are written in one nested create.
 */
export async function issueQuote(
  input: IssueQuoteInput
): Promise<IssueQuoteResult> {
  if (!Number.isInteger(input.billRevision) || input.billRevision < 0) {
    throw new RangeError('billRevision must be a non-negative integer');
  }

  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS);
  const quoteId = randomBytes(16).toString('base64url');
  const promotionIds = Array.from(new Set(input.promotionIds ?? [])).filter(
    (promotionId) => promotionId.length > 0
  );

  await prisma.quote.create({
    data: {
      id: quoteId,
      restaurantId: input.restaurantId,
      tableId: input.tableId ?? null,
      sessionId: input.sessionId ?? null,
      cartKey: input.cartKey ?? null,
      cartHash: cartHash(input.lines),
      billRevision: input.billRevision,
      customerId: input.customerId ?? null,
      phoneHash: input.phoneHash ?? null,
      promotionDiscountAmount: toMoneyString(
        input.pricing.promotionDiscountAmount
      ),
      visitState: input.pricing.visitState,
      projectedRewardAmount: toMoneyString(input.pricing.projectedRewardAmount),
      rewardLabel: input.pricing.rewardLabel ?? null,
      subtotal: toMoneyString(input.pricing.subtotal),
      discountAmount: toMoneyString(input.pricing.discountAmount),
      taxAmount: toMoneyString(input.pricing.taxAmount),
      serviceCharge: toMoneyString(input.pricing.serviceCharge),
      totalAmount: toMoneyString(input.pricing.totalAmount),
      projectedTotal: toMoneyString(input.pricing.projectedTotal),
      cashPayable: toMoneyString(input.pricing.cashPayable),
      issuedAt: now,
      expiresAt,
      quotePromotions: {
        create: promotionIds.map((promotionId) => ({
          restaurantId: input.restaurantId,
          promotionId,
        })),
      },
    },
  });

  return { quoteId, expiresAt };
}

/**
 * Member binding precedence: `customerId` when non-null, else `phoneHash`
 * (§18.20.15 D). A guest quote has neither, so a member cannot be added after
 * the quote was issued.
 */
function bindingMatches(
  quote: {
    customerId: string | null;
    phoneHash: string | null;
  },
  input: ConsumeQuoteInput
): boolean {
  if (quote.customerId !== null) {
    return input.customerId === quote.customerId;
  }

  if (quote.phoneHash !== null) {
    return input.phoneHash === quote.phoneHash;
  }

  return (
    (input.customerId ?? null) === null && (input.phoneHash ?? null) === null
  );
}

/**
 * Validate and consume a quote inside the caller's order-create transaction.
 *
 * Rejects a missing, consumed, expired, re-priced, re-carted or re-membered
 * quote with `QUOTE_CHANGED`. The conditional `updateMany` makes consumption
 * atomic: a concurrent second consume updates zero rows and is rejected even
 * with a different idempotency key.
 */
export async function consumeQuote(
  input: ConsumeQuoteInput,
  tx: TransactionClient
): Promise<ConsumeQuoteResult> {
  const now = input.now ?? new Date();

  const quote = await tx.quote.findFirst({
    where: { restaurantId: input.restaurantId, id: input.quoteId },
  });

  if (!quote) return quoteChanged();
  if (quote.consumedAt !== null) return quoteChanged();
  if (now.getTime() >= new Date(quote.expiresAt).getTime()) {
    return quoteChanged();
  }
  if (quote.cartHash !== input.cartHash) return quoteChanged();
  if (!bindingMatches(quote, input)) return quoteChanged();

  if (input.expectedTotal === null || input.expectedTotal === undefined) {
    return quoteChanged();
  }
  if (!new Decimal(input.expectedTotal).eq(new Decimal(quote.projectedTotal))) {
    return quoteChanged();
  }

  const consumed = await tx.quote.updateMany({
    where: {
      restaurantId: input.restaurantId,
      id: input.quoteId,
      consumedAt: null,
    },
    data: { consumedAt: now, orderId: input.orderId },
  });

  if (consumed.count !== 1) return quoteChanged();

  return {
    ok: true,
    quote: {
      quoteId: quote.id,
      customerId: quote.customerId,
      phoneHash: quote.phoneHash,
      projectedTotal: new Decimal(quote.projectedTotal),
      cashPayable: new Decimal(quote.cashPayable),
    },
  };
}

/**
 * Read a quote for the caller's own session.
 *
 * A quote id is never exposed outside its originating session. Callers must
 * supply at least one of the session bindings; a quote is returned only when
 * every supplied binding matches. Cross-tenant ids return `null`.
 */
export async function getQuote(
  input: GetQuoteInput
): Promise<QuoteView | null> {
  const where: {
    restaurantId: string;
    id: string;
    sessionId?: string;
    tableId?: string;
    cartKey?: string;
  } = {
    restaurantId: input.restaurantId,
    id: input.quoteId,
  };

  if (input.sessionId) where.sessionId = input.sessionId;
  if (input.tableId) where.tableId = input.tableId;
  if (input.cartKey) where.cartKey = input.cartKey;

  if (!input.sessionId && !input.tableId && !input.cartKey) {
    return null;
  }

  const quote = await prisma.quote.findFirst({
    where,
    include: {
      quotePromotions: { select: { promotionId: true } },
    },
  });

  if (!quote) return null;

  return {
    quoteId: quote.id,
    restaurantId: quote.restaurantId,
    tableId: quote.tableId,
    sessionId: quote.sessionId,
    cartKey: quote.cartKey,
    cartHash: quote.cartHash,
    billRevision: quote.billRevision,
    customerId: quote.customerId,
    phoneHash: quote.phoneHash,
    promotionIds: quote.quotePromotions.map(
      (promotion) => promotion.promotionId
    ),
    promotionDiscountAmount: new Decimal(quote.promotionDiscountAmount),
    visitState: quote.visitState,
    projectedRewardAmount: new Decimal(quote.projectedRewardAmount),
    rewardLabel: quote.rewardLabel,
    subtotal: new Decimal(quote.subtotal),
    discountAmount: new Decimal(quote.discountAmount),
    taxAmount: new Decimal(quote.taxAmount),
    serviceCharge: new Decimal(quote.serviceCharge),
    totalAmount: new Decimal(quote.totalAmount),
    projectedTotal: new Decimal(quote.projectedTotal),
    cashPayable: new Decimal(quote.cashPayable),
    issuedAt: quote.issuedAt,
    expiresAt: quote.expiresAt,
    consumedAt: quote.consumedAt,
    orderId: quote.orderId,
  };
}
