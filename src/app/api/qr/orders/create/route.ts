/**
 * QR Order Creation Endpoint
 * Build: 2026-01-04
 *
 * Public endpoint (no authentication required) for creating orders from QR code scan.
 * Uses table-based sessions and server-side cart.
 *
 * Flow:
 * 1. Get table session (contains cart)
 * 2. Validate cart has items
 * 3. Create order from cart
 * 4. Clear cart
 * 5. Send to kitchen
 *
 * @see CLAUDE.md - Type Safety, Validation, Error Handling
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { calculateOrderTotals, estimateReadyTime } from '@/lib/order-utils';
import { SequenceManager } from '@/lib/sequence-manager';
import { isBusinessDayClosing } from '@/lib/time/business-day-guard';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { getTableCart, clearTableCart } from '@/lib/customer-session';
import { ensureOpenDiningSession } from '@/lib/dining-session';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { z } from 'zod';
import {
  canTableAcceptOrders,
  getTableUnavailableMessage,
} from '@/lib/table-utils';
import { getQrOrderingAvailability } from '@/lib/qr-ordering-availability';
import { recordRestaurantChange } from '@/lib/restaurant-changes';
import { idempotencyKeyFrom } from '@/lib/order-idempotency';
import { toMoneyString } from '@/lib/loyalty/money';
import { isLoyaltyActive, isLoyaltyGloballyEnabled } from '@/lib/loyalty/flags';
import { hashPhone, normalisePhone } from '@/lib/loyalty/phone';
import {
  enforceRateLimits,
  type RateLimitRefusal,
} from '@/lib/loyalty/rate-limit';
import { trustedIp } from '@/lib/loyalty/trusted-ip';
import { consumeQuote, getQuote } from '@/lib/services/loyalty-quote-service';
import {
  completeOrderCreateRecord,
  findOrderCreateRecord,
  newLoyaltyOrderId,
  orderCreateRequestHash,
  prepareLoyaltyCreate,
  startOrderCreateRecord,
  type LoyaltyCreatePlan,
} from '@/lib/services/loyalty-qr-service';

// ============================================================================
// Validation Schema
// ============================================================================

const customerInfoFields = {
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  // Loyalty consent is additive. `marketingOptIn` is deliberately absent:
  // marketing is Counter-only (§18.20.5).
  consent: z.boolean().optional(),
  consentVersion: z.string().max(100).optional(),
  consentTextHash: z.string().max(200).optional(),
};

const CreateQROrderSchema = z.object({
  tableId: z.string().uuid('Invalid table ID format'),
  sessionId: z.string().uuid('Invalid session ID format').optional(),
  customerInfo: z
    .object({
      ...customerInfoFields,
      // Pre-P4 phone validation is preserved when no quote is supplied.
      phone: z.string().min(8).max(20).optional(),
    })
    .optional(),
  specialInstructions: z.string().max(500).optional(),
  // Loyalty price lock. Absent means the legacy create path.
  quoteId: z.string().min(1).max(200).optional(),
  // Kept as a string here so a malformed value can return QUOTE_CHANGED
  // instead of a Zod 400 or a raw DecimalError (REVIEW-05 F-03).
  expectedTotal: z.string().optional(),
});

const LoyaltyCreateQROrderSchema = z.object({
  tableId: z.string().uuid('Invalid table ID format'),
  sessionId: z.string().uuid('Invalid session ID format').optional(),
  customerInfo: z
    .object({
      ...customerInfoFields,
      // A malformed phone is a guest fallback, not a request error: normalise
      // and validate it in the loyalty service (§18.20.5).
      phone: z.string().max(32).optional(),
    })
    .optional(),
  specialInstructions: z.string().max(500).optional(),
  quoteId: z.string().min(1).max(200).optional(),
  expectedTotal: z.string().optional(),
});

class QuoteChangedError extends Error {
  readonly code = 'QUOTE_CHANGED';

  constructor() {
    super('The quote is no longer valid. Request a new quote.');
    this.name = 'QuoteChangedError';
  }
}

// ============================================================================
// API Handler
// ============================================================================

function storedOrderIdFrom(body: Prisma.JsonValue | null): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const order = (body as Record<string, unknown>).order;
  if (!order || typeof order !== 'object' || Array.isArray(order)) return null;
  const id = (order as Record<string, unknown>).id;
  return typeof id === 'string' ? id : null;
}

function idempotencyMismatchResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'This idempotency key was used for a different request.',
      code: 'IDEMPOTENCY_MISMATCH',
    },
    { status: 409 }
  );
}

function rateLimitedResponse(refusal: RateLimitRefusal) {
  // No phone, phoneHash, member id, count or scope: the refusal must not
  // distinguish a member from a non-member.
  return NextResponse.json(
    {
      success: false,
      error: 'Too many attempts. Please try again later.',
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
  let loyaltyPlan: LoyaltyCreatePlan | null = null;

  try {
    // Parse and validate request body. A request with `quoteId` uses the
    // loyalty phone rules; everything else keeps the pre-P4 schema.
    const body = await request.json();
    const validatedData = (
      body?.quoteId ? LoyaltyCreateQROrderSchema : CreateQROrderSchema
    ).parse(body);
    const { tableId, sessionId, customerInfo, specialInstructions } =
      validatedData;
    const { quoteId, expectedTotal } = validatedData;
    const idempotencyKey = idempotencyKeyFrom(request);

    // Idempotent replay must work even after the successful create cleared the
    // cart. It is gated on loyalty being active so the legacy path can never
    // return a stored loyalty response. A replayed key must match the original
    // request hash and the quote that consumed the stored order; anything else
    // is `IDEMPOTENCY_MISMATCH` (§18.20.14 F/G).
    if (quoteId && idempotencyKey && isLoyaltyGloballyEnabled()) {
      const earlyTable = await prisma.table.findUnique({
        where: { id: tableId },
        select: { restaurantId: true },
      });
      if (earlyTable) {
        const earlySettings = await prisma.loyaltySettings.findUnique({
          where: { restaurantId: earlyTable.restaurantId },
        });
        if (isLoyaltyActive(earlySettings)) {
          const record = await findOrderCreateRecord(
            earlyTable.restaurantId,
            idempotencyKey
          );
          if (record?.status === 'COMPLETED' && record.responseJson) {
            const currentHash = orderCreateRequestHash({
              restaurantId: earlyTable.restaurantId,
              tableId,
              sessionId: sessionId ?? null,
              quoteId,
              expectedTotal: expectedTotal ?? '',
              customerInfo,
            });
            if (record.requestHash !== currentHash) {
              return idempotencyMismatchResponse();
            }

            const quote = await getQuote({
              restaurantId: earlyTable.restaurantId,
              quoteId,
              sessionId: sessionId ?? undefined,
              tableId,
            });
            const storedOrderId = storedOrderIdFrom(record.responseJson);
            if (
              !quote ||
              quote.orderId === null ||
              storedOrderId === null ||
              quote.orderId !== storedOrderId
            ) {
              return idempotencyMismatchResponse();
            }

            // A member-bound quote must still match the replayed body.
            if (quote.customerId !== null || quote.phoneHash !== null) {
              const normalised = normalisePhone(customerInfo?.phone);
              if (!normalised.ok) return idempotencyMismatchResponse();
              if (quote.phoneHash !== null) {
                let phoneHash: string;
                try {
                  phoneHash = hashPhone(normalised.phone);
                } catch {
                  return idempotencyMismatchResponse();
                }
                if (quote.phoneHash !== phoneHash) {
                  return idempotencyMismatchResponse();
                }
              }
              if (quote.customerId !== null && customerInfo?.consent !== true) {
                return idempotencyMismatchResponse();
              }
            }

            return NextResponse.json(record.responseJson, { status: 200 });
          }
        }
      }
    }

    // Get table cart (includes session and cart items)
    // Pass sessionId to get the correct customer's cart
    const tableCart = await getTableCart(tableId, sessionId);

    if (!tableCart || tableCart.items.length === 0) {
      return NextResponse.json(
        { error: 'Cart is empty. Please add items before ordering.' },
        { status: 400 }
      );
    }

    // Verify table exists and get restaurant info
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        restaurant: {
          select: {
            id: true,
            taxRate: true,
            serviceChargeRate: true,
            // Select labels for snapshotting
            taxLabel: true,
            serviceChargeLabel: true,
            isActive: true,
          },
        },
      },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    if (!table.restaurant.isActive) {
      return NextResponse.json(
        { error: 'Restaurant is currently closed' },
        { status: 503 }
      );
    }

    console.log('🔍 [QR ORDER CREATE] Table status check:', {
      tableId: table.id,
      tableNumber: table.tableNumber,
      status: table.status,
      statusType: typeof table.status,
    });

    // ✅ STRICT VALIDATION: Prevent ordering from unavailable tables (RESERVED or INACTIVE)
    if (!canTableAcceptOrders(table.status)) {
      const { message } = getTableUnavailableMessage(table.status);
      console.log(`❌ [QR ORDER CREATE] Blocking ${table.status} table`);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Offline/presence gate. A customer on mobile data can still reach the
    // server while the restaurant's own WAN is down; accepting that order would
    // create a PENDING order that no Counter can receive. Manual pause and the
    // automatic Counter-presence gate both land here.
    const availability = await getQrOrderingAvailability(table.restaurant.id);
    if (!availability.available) {
      console.log(
        `[QR ORDER CREATE] Blocked ordering for restaurant ${table.restaurant.id}: ${availability.reason}`
      );
      return NextResponse.json(
        {
          success: false,
          error: availability.message,
          message: availability.message,
          code: 'ORDERING_PAUSED',
          reason: availability.reason,
        },
        { status: 503 }
      );
    }

    console.log(
      '✅ [QR ORDER CREATE] Table status check passed, allowing order'
    );

    // Durable hourly limits (§18.20.15 B). Loyalty must be active for the
    // restaurant; a flag-off request writes no rows and follows the legacy
    // path exactly. Enforcement happens before `prepareLoyaltyCreate` resolves
    // a member, so an enumeration attempt costs nothing.
    if (isLoyaltyGloballyEnabled()) {
      const loyaltySettings = await prisma.loyaltySettings.findUnique({
        where: { restaurantId: table.restaurant.id },
      });
      if (isLoyaltyActive(loyaltySettings)) {
        const refusal = await enforceRateLimits({
          restaurantId: table.restaurant.id,
          sessionId: tableCart.sessionId,
          phone: customerInfo?.phone ?? null,
          ip: trustedIp(request),
        });
        if (refusal) return rateLimitedResponse(refusal);
      }
    }

    // Fetch full menu items for calculation (need preparationTime)
    const menuItemIds = tableCart.items.map((item) => item.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      select: {
        id: true,
        name: true,
        price: true,
        preparationTime: true,
        imageUrl: true,
        description: true,
        allergens: true,
        dietaryInfo: true,
        isAvailable: true,
        isFeatured: true,
        displayOrder: true,
        costPrice: true,
        calories: true,
      },
    });

    const menuItemsMap = new Map(menuItems.map((item) => [item.id, item]));

    // Convert cart items to CartItem format for calculation
    // We cast to any here because customer-session returns a subset of VariationOption
    // but strict typing isn't needed for calculation, which uses .totalPrice
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderItems: any[] = tableCart.items.map((item) => {
      const menuItem = menuItemsMap.get(item.menuItemId);
      if (!menuItem) {
        throw new Error(`Menu item ${item.menuItemId} not found`);
      }

      return {
        id: item.id,
        menuItemId: item.menuItemId,
        menuItem: {
          id: menuItem.id,
          name: menuItem.name,
          price: Number(menuItem.price),
          preparationTime: menuItem.preparationTime,
          imageUrl: menuItem.imageUrl ?? undefined,
          description: menuItem.description ?? undefined,
          allergens: menuItem.allergens,
          dietaryInfo: menuItem.dietaryInfo,
          isAvailable: menuItem.isAvailable,
          isFeatured: menuItem.isFeatured,
          displayOrder: menuItem.displayOrder,
          costPrice: menuItem.costPrice
            ? Number(menuItem.costPrice)
            : undefined,
          calories: menuItem.calories ?? undefined,
          variationGroups: [], // Not needed for calculation
        },
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.subtotal,
        specialInstructions: item.specialInstructions || undefined,
        // Map customer-session options to the structure expected by types (roughly)
        selectedOptions: item.selectedOptions,
      };
    });

    // Calculate order totals
    const totals = calculateOrderTotals(
      orderItems,
      parseFloat(table.restaurant.taxRate.toString()),
      parseFloat(table.restaurant.serviceChargeRate.toString())
    );

    if (await isBusinessDayClosing(table.restaurant.id)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The business day is closing. Please ask the counter to resolve the current day.',
          code: 'BUSINESS_DAY_CLOSING',
        },
        { status: 409 }
      );
    }

    // Loyalty is additive. Without a quote (or with loyalty inactive) this
    // returns `legacy` and the rest of the route is exactly the pre-P4 path.
    // It runs before the daily sequence is allocated so an idempotent replay or
    // a rejected quote does not consume an order number.
    const loyalty = await prepareLoyaltyCreate({
      restaurantId: table.restaurant.id,
      tableId,
      sessionId: tableCart.sessionId,
      requestSessionId: sessionId ?? null,
      cart: { items: tableCart.items },
      customerInfo,
      quoteId,
      expectedTotal,
      idempotencyKey,
    });

    if (loyalty.kind === 'error') {
      return NextResponse.json(
        {
          success: false,
          error: loyalty.message,
          code: loyalty.code,
        },
        { status: loyalty.status }
      );
    }

    if (loyalty.kind === 'replay') {
      return NextResponse.json(loyalty.body, { status: loyalty.status });
    }

    const loyaltyPlanForRequest: LoyaltyCreatePlan | null =
      loyalty.kind === 'ready' ? loyalty.plan : null;
    loyaltyPlan = loyaltyPlanForRequest;

    // Generate sequential order number
    const { number: dailySeq, formatted: orderNumber } =
      await SequenceManager.getNextOrder(table.restaurant.id);

    // Estimate ready time
    const estimatedReadyTime = estimateReadyTime(orderItems);

    // The kitchen ticket is deliberately NOT created here. Unpaid QR orders
    // wait in the owner/manager PENDING queue; the station ticket is emitted
    // when the order becomes CONFIRMED (D41). The legacy owner notification
    // below still announces the pending order to the dashboard.

    const previousTableStatus = table.status;
    let loyaltyResponseBody: Record<string, unknown> | null = null;

    // Create the order, items and table/session transition atomically. The
    // dining-session helper locks the table row so concurrent QR orders reuse
    // one current sitting.
    const order = await prisma.$transaction(async (tx) => {
      if (customerInfo) {
        // Store one canonical phone format so member deletion can match the
        // session by a single E.164 equality. A malformed phone must not leave
        // raw PII (or the accompanying name/email) in `customer_sessions`.
        const normalisedPhone = normalisePhone(customerInfo.phone);
        const sessionPhone = normalisedPhone.ok ? normalisedPhone.phone : null;
        await tx.customerSession.update({
          where: { id: tableCart.sessionId },
          data: {
            customerName: sessionPhone ? (customerInfo.name ?? null) : null,
            customerPhone: sessionPhone,
            customerEmail: sessionPhone ? (customerInfo.email ?? null) : null,
          },
        });
      }

      const diningSession = await ensureOpenDiningSession(tx, tableId);
      const plan = loyaltyPlan;
      const loyaltyOrderId = plan ? newLoyaltyOrderId() : null;

      if (plan && plan.idempotencyKey && plan.requestHash) {
        await startOrderCreateRecord(tx, {
          restaurantId: table.restaurant.id,
          key: plan.idempotencyKey,
          requestHash: plan.requestHash,
        });
      }

      if (plan && loyaltyOrderId) {
        const consumed = await consumeQuote(
          {
            restaurantId: table.restaurant.id,
            quoteId: plan.quote.quoteId,
            sessionId: tableCart.sessionId,
            tableId,
            cartHash: plan.cartHash,
            customerId: plan.customerId,
            phoneHash: plan.phoneHash,
            expectedTotal: plan.expectedTotal,
            orderId: loyaltyOrderId,
          },
          tx
        );

        if (!consumed.ok) throw new QuoteChangedError();
      }

      const cartTotals = plan ? plan.cartPreRewardTotals : null;

      const created = await tx.order.create({
        data: {
          ...(loyaltyOrderId ? { id: loyaltyOrderId } : {}),
          orderNumber,
          dailySeq,
          restaurantId: table.restaurant.id,
          tableId,
          customerSessionId: tableCart.sessionId,
          diningSessionId: diningSession.id,
          subtotalAmount: cartTotals ? cartTotals.subtotal : totals.subtotal,
          taxAmount: cartTotals ? cartTotals.taxAmount : totals.taxAmount,
          serviceCharge: cartTotals
            ? cartTotals.serviceCharge
            : totals.serviceCharge,
          discountAmount: cartTotals ? cartTotals.discountAmount : 0,
          totalAmount: cartTotals ? cartTotals.totalAmount : totals.totalAmount,
          ...(plan
            ? {
                customerId: plan.customerId,
                discountSource: plan.cartPromotion
                  ? ('PROMOTION' as const)
                  : null,
                discountLabel: plan.cartPromotion
                  ? (plan.cartPromotion.result.label ??
                    plan.cartPromotion.promotion.receiptLabel ??
                    plan.cartPromotion.promotion.name)
                  : null,
              }
            : {}),

          // Snapshot rates and labels for integrity
          taxRateSnapshot: table.restaurant.taxRate,
          serviceChargeRateSnapshot: table.restaurant.serviceChargeRate,
          taxLabelSnapshot: table.restaurant.taxLabel,
          serviceChargeLabelSnapshot: table.restaurant.serviceChargeLabel,

          status: 'PENDING',
          paymentStatus: 'PENDING',
          specialInstructions,
          estimatedReadyTime,
        },
      });

      for (const cartItem of tableCart.items) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: created.id,
            menuItemId: cartItem.menuItemId,
            quantity: cartItem.quantity,
            unitPrice: cartItem.unitPrice,
            totalAmount: cartItem.subtotal,
            specialInstructions: cartItem.specialInstructions,
            status: 'PENDING',
          },
        });

        // Create order item options snapshots
        if (cartItem.selectedOptions && cartItem.selectedOptions.length > 0) {
          await tx.orderItemOption.createMany({
            data: cartItem.selectedOptions.map((opt) => ({
              orderItemId: orderItem.id,
              name: opt.name,
              priceModifier: opt.priceModifier,
            })),
          });
        }
      }

      // ensureOpenDiningSession owns the table occupancy transition.

      if (plan) {
        if (plan.cartPromotion) {
          const promotion = plan.cartPromotion.promotion;
          const result = plan.cartPromotion.result;

          await tx.orderDiscount.create({
            data: {
              orderId: created.id,
              restaurantId: table.restaurant.id,
              diningSessionId: diningSession.id,
              source: 'PROMOTION',
              sourceId: promotion.id,
              label: result.label ?? promotion.receiptLabel ?? promotion.name,
              baseAmount: result.eligibleBase,
              amount: result.discountAmount,
              promotionSnapshot: {
                name: promotion.name,
                type: promotion.type,
                value: toMoneyString(promotion.value),
                scope: promotion.scope,
                categoryIds: [...promotion.categoryIds],
                itemIds: [...promotion.itemIds],
                minSpend: toMoneyString(promotion.minSpend),
                maxDiscount: toMoneyString(promotion.maxDiscount),
                receiptLabel: promotion.receiptLabel,
              } as Prisma.InputJsonValue,
              rewardSnapshot: undefined,
              status: 'ACTIVE',
            },
          });
        }

        // Order create adds one order to the bill. The quote is the price
        // lock; the bill revision moves forward for the next quote/bill read.
        await tx.diningSession.update({
          where: { id: diningSession.id },
          data: { billRevision: { increment: 1 } },
        });

        loyaltyResponseBody = {
          success: true,
          order: {
            id: created.id,
            orderNumber: created.orderNumber,
            dailySeq: created.dailySeq ?? undefined,
            status: created.status,
            paymentStatus: created.paymentStatus,
            subtotalAmount: Number(created.subtotalAmount),
            taxAmount: Number(created.taxAmount),
            serviceCharge: Number(created.serviceCharge),
            totalAmount: created.totalAmount,
            estimatedReadyTime: created.estimatedReadyTime,
            sessionToken: tableCart.sessionId,
            taxLabelSnapshot: created.taxLabelSnapshot,
            serviceChargeLabelSnapshot: created.serviceChargeLabelSnapshot,
            taxRateSnapshot: Number(created.taxRateSnapshot),
            serviceChargeRateSnapshot: Number(
              created.serviceChargeRateSnapshot
            ),
          },
          projectedTotal: toMoneyString(plan.computation.projectedTotal),
          rewardLabel: plan.computation.projectedRewardAmount.gt(0)
            ? plan.computation.rewardLabel
            : null,
          visitState: plan.computation.visitState,
          ...(plan.guestError ? { loyaltyError: plan.guestError } : {}),
          message:
            'Order submitted successfully! Please pay at the counter when ready.',
        };

        if (plan.idempotencyKey) {
          await completeOrderCreateRecord(tx, {
            restaurantId: table.restaurant.id,
            key: plan.idempotencyKey,
            response: loyaltyResponseBody as Prisma.InputJsonValue,
          });
        }
      }

      return created;
    });

    await recordRestaurantChange({
      restaurantId: table.restaurant.id,
      entityType: 'order',
      entityId: order.id,
    });

    if (previousTableStatus !== 'OCCUPIED') {
      console.log(
        `[OrderCreate] Table ${table.tableNumber} (${tableId}) marked as occupied (was: ${previousTableStatus})`
      );

      // Real-time table status update notification
      await PostgresEventManager.publishTableStatusChange({
        tableId,
        restaurantId: table.restaurant.id,
        previousStatus: previousTableStatus,
        newStatus: 'OCCUPIED',
        updatedBy: 'customer',
        timestamp: Date.now(),
      });
    } else {
      console.log(
        `[OrderCreate] Table ${table.tableNumber} (${tableId}) already occupied, no status change needed`
      );
    }

    // Clear cart after successful order creation
    await clearTableCart(tableId);

    // End the customer session
    await prisma.customerSession.update({
      where: { id: tableCart.sessionId },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
      },
    });

    // Send real-time notification via PostgreSQL NOTIFY
    await PostgresEventManager.publishOrderCreated({
      orderId: order.id,
      restaurantId: table.restaurant.id,
      tableId,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      timestamp: Date.now(),
    });

    // Ensure table status is consistent (safety check)
    // We await this to ensure the UI reflects the change immediately
    try {
      await autoUpdateTableStatus(tableId);
    } catch (error) {
      console.error(
        `[OrderCreate] Failed to auto-update table status for table ${tableId}:`,
        error
      );
    }

    if (loyaltyResponseBody) {
      return NextResponse.json(loyaltyResponseBody);
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        dailySeq: order.dailySeq ?? undefined,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotalAmount: Number(order.subtotalAmount),
        taxAmount: Number(order.taxAmount),
        serviceCharge: Number(order.serviceCharge),
        totalAmount: order.totalAmount,
        estimatedReadyTime: order.estimatedReadyTime,
        sessionToken: tableCart.sessionId,
        // Return snapshots for immediate display
        taxLabelSnapshot: order.taxLabelSnapshot,
        serviceChargeLabelSnapshot: order.serviceChargeLabelSnapshot,
        taxRateSnapshot: Number(order.taxRateSnapshot),
        serviceChargeRateSnapshot: Number(order.serviceChargeRateSnapshot),
      },
      message:
        'Order submitted successfully! Please pay at the counter when ready.',
    });
  } catch (error) {
    console.error('QR order creation error:', error);

    if (error instanceof QuoteChangedError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: 'QUOTE_CHANGED',
        },
        { status: 409 }
      );
    }

    // A concurrent create with the same idempotency key can lose the unique
    // insert. The winner's completed response is the replay; an in-flight
    // winner is a retryable conflict, never a second order.
    if (
      loyaltyPlan?.idempotencyKey &&
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    ) {
      const record = await findOrderCreateRecord(
        loyaltyPlan.quote.restaurantId,
        loyaltyPlan.idempotencyKey
      );
      if (
        record?.status === 'COMPLETED' &&
        record.requestHash === loyaltyPlan.requestHash &&
        record.responseJson
      ) {
        return NextResponse.json(record.responseJson, { status: 200 });
      }
      return NextResponse.json(
        {
          success: false,
          error: 'A request with this idempotency key is in progress.',
          code: 'IDEMPOTENCY_MISMATCH',
        },
        { status: 409 }
      );
    }

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    // Handle known errors
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Handle unknown errors
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
