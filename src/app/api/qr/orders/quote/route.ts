/**
 * QR order review quote.
 *
 * One server-issued price lock for the current cart/session bill
 * (§18.20.5, §18.20.14 C/G, §18.20.15 B/E). The quote resolves a member only
 * when consent is present and verifies; otherwise it is a guest quote and
 * returns no member data. Spend/minimum fields are never returned here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { getTableCart } from '@/lib/customer-session';
import { isLoyaltyActive, isLoyaltyGloballyEnabled } from '@/lib/loyalty/flags';
import { resolveNotice } from '@/lib/loyalty/consent';
import { hashPhone, normalisePhone } from '@/lib/loyalty/phone';
import {
  recordLoyaltyLookupMiss,
  recordRateLimited,
  recordRateLimitUnavailable,
} from '@/lib/loyalty/enumeration';
import {
  enforceRateLimits,
  type RateLimitRefusal,
} from '@/lib/loyalty/rate-limit';
import { trustedIp } from '@/lib/loyalty/trusted-ip';
import { buildQuoteMessage } from '@/lib/loyalty/message';
import { toMoneyString } from '@/lib/loyalty/money';
import { resolveOrCreateCustomer } from '@/lib/services/loyalty-customer-service';
import {
  issueQrQuote,
  type GuestReason,
} from '@/lib/services/loyalty-qr-service';

const QrQuoteSchema = z.object({
  tableId: z.string().uuid('Invalid table ID format'),
  sessionId: z.string().uuid('Invalid session ID format').optional(),
  phone: z.string().max(32).optional(),
  consent: z.boolean().optional(),
  consentVersion: z.string().max(100).optional(),
  consentTextHash: z.string().max(200).optional(),
});

function disabledResponse() {
  return NextResponse.json(
    {
      success: false,
      error:
        buildQuoteMessage({
          visitState: 'GUEST',
          loyaltyDisabled: true,
        }) ?? 'Loyalty is off for this restaurant.',
      code: 'LOYALTY_DISABLED',
    },
    { status: 200 }
  );
}

function mapMemberError(code: string | undefined): GuestReason {
  switch (code) {
    case 'PHONE_INVALID':
    case 'CONSENT_REQUIRED':
    case 'CONSENT_STALE':
      return code;
    case 'CONSENT_VERSION_REQUIRED':
      return 'CONSENT_VERSION_REQUIRED';
    default:
      // The P3 member-resolution race returns LOYALTY_DISABLED. It must not
      // render as "Loyalty is off" on the QR (REVIEW-05 N-01).
      return 'MEMBER_RESOLUTION_FAILED';
  }
}

function rateLimitedResponse(refusal: RateLimitRefusal) {
  // No phone, phoneHash, member id, count or scope: the refusal must not
  // distinguish a member from a non-member. A refused QR customer is sent to
  // the counter; the retry window stays in the header for clients that need it.
  return NextResponse.json(
    {
      success: false,
      error: 'Please order at the counter — our staff will help.',
      code: 'RATE_LIMITED',
      retryAfterSeconds: refusal.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(refusal.retryAfterSeconds) },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    // Fail closed before any database access. With LOYALTY_ENABLED unset the
    // quote route must not touch the database at all.
    if (!isLoyaltyGloballyEnabled()) {
      return disabledResponse();
    }

    const body = await request.json();
    const {
      tableId,
      sessionId,
      phone,
      consent,
      consentVersion,
      consentTextHash,
    } = QrQuoteSchema.parse(body);

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        restaurant: {
          select: {
            id: true,
            isActive: true,
          },
        },
      },
    });

    if (!table) {
      return NextResponse.json(
        { success: false, error: 'Table not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!table.restaurant.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: 'Restaurant is currently closed',
          code: 'RESTAURANT_CLOSED',
        },
        { status: 503 }
      );
    }

    const settings = await prisma.loyaltySettings.findUnique({
      where: { restaurantId: table.restaurant.id },
    });
    if (!settings || !isLoyaltyActive(settings)) {
      return disabledResponse();
    }

    const notice = resolveNotice(settings);
    if (!notice) {
      return disabledResponse();
    }

    const cart = await getTableCart(tableId, sessionId);
    if (!cart || cart.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cart is empty. Please add items before ordering.',
          code: 'CART_EMPTY',
        },
        { status: 400 }
      );
    }

    // Durable hourly limits (§18.20.15 B, P7c). Guest requests carry no phone
    // and are skipped entirely: a guest quote cannot enumerate, and counting it
    // exhausted the shared restaurant and edge-IP buckets for real customers.
    // A phone-bearing request is limited before any member resolution so an
    // enumeration attempt costs nothing and cannot reveal a member by timing or
    // error shape. A flag-off request never reaches here.
    const ip = trustedIp(request);
    if (phone) {
      const decision = await enforceRateLimits({
        restaurantId: table.restaurant.id,
        sessionId: cart.sessionId,
        phone,
        ip,
        limits: { restaurant: settings.lookupLimitPerHour },
      });

      if (decision.failedOpen) {
        // Fail open: the lookup shares this database, so a counter outage
        // already means the quote cannot be priced. Record one event, proceed.
        await recordRateLimitUnavailable({
          restaurantId: table.restaurant.id,
          ip,
        });
      } else if (!decision.allowed && decision.refusal) {
        await recordRateLimited({
          restaurantId: table.restaurant.id,
          scope: decision.refusal.scope,
          subject: decision.refusal.subject,
          ip,
        });
        return rateLimitedResponse(decision.refusal);
      }
    }

    let customerId: string | null = null;
    let phoneHash: string | null = null;
    let guestReason: GuestReason | null = null;

    if (!phone) {
      guestReason = 'NO_PHONE';
    } else if (consent !== true) {
      guestReason = 'CONSENT_REQUIRED';
    } else {
      const member = await resolveOrCreateCustomer({
        restaurantId: table.restaurant.id,
        phone,
        consent: {
          clientVersion: consentVersion,
          clientTextHash: consentTextHash,
        },
        notice,
        source: 'QR',
      });

      if (member.customerId) {
        const normalised = normalisePhone(phone);
        if (normalised.ok) {
          try {
            customerId = member.customerId;
            phoneHash = hashPhone(normalised.phone);
          } catch {
            customerId = null;
            phoneHash = null;
            guestReason = 'MEMBER_RESOLUTION_FAILED';
          }
        } else {
          guestReason = 'PHONE_INVALID';
        }

        // A valid, consented phone that created a new member was a phone-hash
        // miss. Detection only: the response is unchanged (§18.20.15 B).
        if (member.isNew && phoneHash) {
          await recordLoyaltyLookupMiss({
            restaurantId: table.restaurant.id,
            ip,
            phoneHash,
            requestPath: request.nextUrl.pathname,
          });
        }
      } else {
        guestReason = mapMemberError(member.loyaltyError?.code);
      }
    }

    const now = new Date();
    const issued = await issueQrQuote({
      restaurantId: table.restaurant.id,
      tableId,
      sessionId: cart.sessionId,
      cart: { items: cart.items },
      customerId,
      phoneHash,
      guestReason,
      now,
    });

    const computation = issued.computation;

    return NextResponse.json({
      success: true,
      quoteId: issued.quoteId,
      quoteRevision: computation.billRevision,
      subtotal: toMoneyString(computation.subtotal),
      promotionDiscountAmount: toMoneyString(
        computation.promotionDiscountAmount
      ),
      projectedRewardAmount: toMoneyString(computation.projectedRewardAmount),
      discountAmount: toMoneyString(computation.discountAmount),
      discountLines: computation.discountLines.map((line) => ({
        source: line.source,
        label: line.label,
        amount: toMoneyString(line.amount),
      })),
      discountedSubtotal: toMoneyString(computation.discountedSubtotal),
      taxAmount: toMoneyString(computation.taxAmount),
      serviceCharge: toMoneyString(computation.serviceCharge),
      totalAmount: toMoneyString(computation.totalAmount),
      projectedTotal: toMoneyString(computation.projectedTotal),
      cashPayable: toMoneyString(computation.cashPayable),
      rewardLabel: computation.rewardLabel,
      rewardType: computation.rewardType,
      rewardValue: computation.rewardValue,
      maxDiscount: toMoneyString(computation.maxDiscount),
      promotionApplied: computation.promotionApplied,
      promotionScope: computation.promotionScope,
      promotionLabel: computation.promotionLabel,
      promotionItems: computation.promotionItems.map((item) => ({
        itemId: item.itemId,
        name: item.name,
      })),
      visitState: computation.visitState,
      visit: {
        completedVisits: computation.completedVisits,
        visitsRequired: computation.visitsRequired,
      },
      message: computation.message,
    });
  } catch (error) {
    console.error('QR loyalty quote error');

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          code: 'INVALID_REQUEST',
          details: error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Could not price this order. Staff can help at the counter.',
        code: 'QUOTE_UNAVAILABLE',
      },
      { status: 500 }
    );
  }
}
