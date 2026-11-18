/**
 * B3-S add-items producer.
 *
 * One canonical staff mutation adds lines to an existing order, re-prices the
 * whole bill from the menu and the order's tax/service snapshots, bumps the
 * optimistic version, and writes the add-on ticket, change row and audit row in
 * the same transaction. A live order emits one `order.items.added` per routed
 * station; a PENDING order emits nothing because the later `order.created`
 * already contains every item exactly once.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { calculateOrderTotals } from '@/lib/order-utils';
import {
  ORDER_EVENT_TYPES,
  recordOrderItemsAdded,
  type OrderCreatedResult,
} from '@/lib/order-events';
import { recordRestaurantChangeTx } from '@/lib/restaurant-changes';
import { isOrderBusinessDayClosed } from '@/lib/orders/order-business-day';
import {
  buildOrderMutationRequestHash,
  deriveOrderModificationKey,
} from '@/lib/orders/order-mutation-idempotency';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { priceCounterOrderLines } from '@/lib/services/counter-order-service';
import {
  acquireOrderModificationLocks,
  reapplyPromotionForModifiedOrder,
} from '@/lib/services/loyalty-order-modify-service';
import type { AddOrderItemsInput } from '@/lib/validation/order-modification-schemas';

export class OrderAddItemsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'OrderAddItemsError';
  }
}

export interface AddOrderItemsActor {
  userId: string;
  userType: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AddOrderItemsResult {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
    version: number;
    subtotalAmount: string;
    taxAmount: string;
    serviceCharge: string;
    discountAmount: string;
    totalAmount: string;
  };
  addedItems: {
    id: string;
    menuItemId: string;
    quantity: number;
    totalAmount: string;
  }[];
  ticket: {
    routed: boolean;
    stationIds: string[];
    unroutedItemIds: string[];
    replayed: boolean;
  };
  isDuplicate: boolean;
  serverTime: string;
}

interface PublishAddOn {
  orderId: string;
  restaurantId: string;
  orderNumber: string;
  orderVersion: number;
  ticketCount: number;
}

const ADDABLE_STATUSES = new Set([
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
]);

const BLOCKED_PAYMENT_STATUSES = new Set(['PAID', 'REFUNDED']);

function money(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function requestHash(orderId: string, input: AddOrderItemsInput): string {
  return buildOrderMutationRequestHash('ADD_ITEMS', orderId, {
    expectedVersion: input.expectedVersion,
    reason: input.reason,
    reasonNotes: input.reasonNotes ?? null,
    customerNotified: input.customerNotified,
    items: input.items
      .map((item) => ({
        clientItemId: item.clientItemId ?? null,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        optionIds: [...(item.optionIds ?? [])].sort(),
        notes: item.notes?.trim() || null,
      }))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      ),
  });
}

function scope(orderId: string, restaurantId: string, key: string) {
  return {
    restaurantId_orderId_operation_idempotencyKey: {
      restaurantId,
      orderId,
      operation: 'ADD_ITEMS' as const,
      idempotencyKey: key,
    },
  };
}

/**
 * Replay the stored response. Only `isDuplicate` and `ticket.replayed` change:
 * the mutation, ticket and audit must not run a second time.
 */
function replay(responseJson: Prisma.JsonValue | null): AddOrderItemsResult {
  if (!responseJson || typeof responseJson !== 'object') {
    throw new OrderAddItemsError(
      'Stored idempotency response is missing',
      'IDEMPOTENCY_RESPONSE_MISSING',
      500
    );
  }
  const stored = responseJson as unknown as AddOrderItemsResult;
  return {
    ...stored,
    isDuplicate: true,
    ticket: { ...stored.ticket, replayed: true },
  };
}

function emptyTicket(): AddOrderItemsResult['ticket'] {
  return {
    routed: false,
    stationIds: [],
    unroutedItemIds: [],
    replayed: false,
  };
}

function ticketFromEvent(
  event: OrderCreatedResult
): AddOrderItemsResult['ticket'] {
  return {
    routed: event.tickets > 0,
    stationIds: event.stationIds,
    unroutedItemIds: event.unroutedItemIds,
    replayed: false,
  };
}

export async function addOrderItems(
  restaurantId: string,
  orderId: string,
  actor: AddOrderItemsActor,
  input: AddOrderItemsInput
): Promise<AddOrderItemsResult> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: {
      id: true,
      restaurantId: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      orderType: true,
      version: true,
      createdAt: true,
      tableId: true,
      customerId: true,
      diningSessionId: true,
      subtotalAmount: true,
      taxAmount: true,
      serviceCharge: true,
      discountAmount: true,
      totalAmount: true,
      taxRateSnapshot: true,
      serviceChargeRateSnapshot: true,
    },
  });

  if (!order) {
    throw new OrderAddItemsError('Order not found', 'ORDER_NOT_FOUND', 404);
  }

  const hash = requestHash(orderId, input);

  // A replay is decided before version/status checks: the request that
  // succeeded already moved the order past those guards.
  const existing = await prisma.orderMutationIdempotency.findUnique({
    where: scope(orderId, restaurantId, input.idempotencyKey),
  });
  if (existing) {
    if (existing.requestHash !== hash) {
      throw new OrderAddItemsError(
        'Idempotency key was reused with a different request',
        'IDEMPOTENCY_KEY_REUSED',
        409
      );
    }
    return replay(existing.responseJson);
  }

  if (!ADDABLE_STATUSES.has(order.status)) {
    throw new OrderAddItemsError(
      'Items cannot be added to this order in its current state.',
      'ORDER_NOT_ADDABLE',
      409
    );
  }
  if (BLOCKED_PAYMENT_STATUSES.has(order.paymentStatus)) {
    throw new OrderAddItemsError(
      'Items cannot be added after payment.',
      'PAYMENT_STATE_INVALID',
      409
    );
  }
  if (await isOrderBusinessDayClosed(restaurantId, order.createdAt)) {
    throw new OrderAddItemsError(
      'This business day is closed. Items cannot be added.',
      'BUSINESS_DAY_CLOSED',
      409
    );
  }
  if (order.version !== input.expectedVersion) {
    throw new OrderAddItemsError(
      'Order was modified by another user. Please refresh and try again.',
      'ORDER_VERSION_CONFLICT',
      409
    );
  }

  const priced = await priceCounterOrderLines(order.restaurantId, input.items);
  if (priced.issues.length > 0) {
    throw new OrderAddItemsError(
      'Some items need attention before they can be added.',
      'VALIDATION_FAILED',
      400,
      priced.issues
    );
  }

  type TxOutcome =
    | {
        kind: 'ok';
        response: AddOrderItemsResult;
        publish: PublishAddOn | null;
      }
    | { kind: 'replay'; response: AddOrderItemsResult };

  let outcome: TxOutcome;
  try {
    outcome = await prisma.$transaction(
      async (tx): Promise<TxOutcome> => {
        const now = new Date();
        const current = await tx.order.findFirst({
          where: { id: orderId, restaurantId },
          include: {
            items: {
              include: { menuItem: true, selectedOptions: true },
            },
          },
        });
        if (!current) {
          throw new OrderAddItemsError(
            'Order not found',
            'ORDER_NOT_FOUND',
            404
          );
        }

        // Same lock order as the bill read, payment and existing modify route:
        // customer/day first, then the bill/order.
        const session = current.diningSessionId
          ? await tx.diningSession.findFirst({
              where: {
                id: current.diningSessionId,
                restaurantId,
              },
              select: { id: true, customerId: true },
            })
          : null;
        await acquireOrderModificationLocks(tx, {
          restaurantId,
          orderId,
          diningSessionId: session?.id ?? null,
          customerId: session
            ? session.customerId
            : (current.customerId ?? null),
          now,
        });

        // A concurrent duplicate may have committed while this request waited
        // for the lock. Replay it instead of writing a second ticket.
        const lockedReceipt = await tx.orderMutationIdempotency.findUnique({
          where: scope(orderId, restaurantId, input.idempotencyKey),
        });
        if (lockedReceipt) {
          if (lockedReceipt.requestHash !== hash) {
            throw new OrderAddItemsError(
              'Idempotency key was reused with a different request',
              'IDEMPOTENCY_KEY_REUSED',
              409
            );
          }
          return {
            kind: 'replay',
            response: replay(lockedReceipt.responseJson),
          };
        }

        if (!ADDABLE_STATUSES.has(current.status)) {
          throw new OrderAddItemsError(
            'Items cannot be added to this order in its current state.',
            'ORDER_NOT_ADDABLE',
            409
          );
        }
        if (BLOCKED_PAYMENT_STATUSES.has(current.paymentStatus)) {
          throw new OrderAddItemsError(
            'Items cannot be added after payment.',
            'PAYMENT_STATE_INVALID',
            409
          );
        }
        if (current.version !== input.expectedVersion) {
          throw new OrderAddItemsError(
            'Order was modified by another user. Please refresh and try again.',
            'ORDER_VERSION_CONFLICT',
            409
          );
        }

        if (
          current.taxRateSnapshot === null ||
          current.serviceChargeRateSnapshot === null
        ) {
          throw new OrderAddItemsError(
            `Order ${current.orderNumber} is missing tax/service rate snapshots.`,
            'ORDER_NOT_ADDABLE',
            409
          );
        }

        const createdItems: {
          id: string;
          menuItemId: string;
          quantity: number;
          totalAmount: Prisma.Decimal;
        }[] = [];
        for (const line of priced.lines) {
          const item = await tx.orderItem.create({
            data: {
              orderId,
              menuItemId: line.menuItemId,
              clientItemId: line.clientItemId ?? null,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalAmount: line.totalAmount,
              specialInstructions: line.notes,
              status: 'PENDING',
              selectedOptions: {
                create: line.options.map((option) => ({
                  name: option.name,
                  priceModifier: option.priceModifier,
                })),
              },
            },
            select: {
              id: true,
              menuItemId: true,
              quantity: true,
              totalAmount: true,
            },
          });
          createdItems.push(item);
        }

        const allItems = await tx.orderItem.findMany({
          where: { orderId },
          include: { menuItem: true, selectedOptions: true },
        });

        // Reuse the existing modify-route rule: a loyalty-active restaurant
        // re-evaluates the promotion ledger; the flag-off path keeps the legacy
        // totals and never touches the ledger.
        const loyaltyPricing = await reapplyPromotionForModifiedOrder(tx, {
          restaurantId: current.restaurantId,
          orderId,
          diningSessionId: current.diningSessionId,
          items: allItems.map((item) => ({
            menuItemId: item.menuItemId,
            totalAmount: item.totalAmount,
            menuItem: {
              name: item.menuItem.name,
              categoryId: item.menuItem.categoryId,
            },
          })),
          taxRate: current.taxRateSnapshot,
          serviceRate: current.serviceChargeRateSnapshot,
          actorId: actor.userId,
          actorType: actor.userType,
          now,
        });

        const totals = loyaltyPricing
          ? {
              subtotal: loyaltyPricing.subtotal,
              taxAmount: loyaltyPricing.taxAmount,
              serviceCharge: loyaltyPricing.serviceCharge,
              totalAmount: loyaltyPricing.totalAmount,
            }
          : calculateOrderTotals(
              allItems.map((item) => ({
                totalPrice: Number(item.totalAmount),
              })),
              Number(current.taxRateSnapshot),
              Number(current.serviceChargeRateSnapshot)
            );

        await tx.orderModification.create({
          data: {
            order: { connect: { id: orderId } },
            modifiedBy: actor.userId,
            reason: input.reason,
            reasonNotes: input.reasonNotes,
            oldTotal: current.totalAmount,
            newTotal: totals.totalAmount,
            customerNotified: input.customerNotified,
            notifiedAt: input.customerNotified ? now : null,
            idempotencyKey: deriveOrderModificationKey(
              'ADD_ITEMS',
              orderId,
              input.idempotencyKey
            ),
            items: {
              create: createdItems.map((item) => ({
                orderItemId: item.id,
                menuItemId: item.menuItemId,
                action: 'added',
                oldQuantity: null,
                newQuantity: item.quantity,
                oldPrice: null,
                newPrice: item.totalAmount,
              })),
            },
          },
        });

        // Claim the write against the version read under the lock. A
        // concurrent cancellation/status change that committed first leaves
        // this at count 0 and rolls back the items, modification and audit.
        const claimed = await tx.order.updateMany({
          where: { id: orderId, version: current.version },
          data: {
            subtotalAmount: totals.subtotal,
            taxAmount: totals.taxAmount,
            serviceCharge: totals.serviceCharge,
            totalAmount: totals.totalAmount,
            ...(loyaltyPricing
              ? {
                  discountAmount: loyaltyPricing.discountAmount,
                  discountSource: loyaltyPricing.discountSource,
                  discountLabel: loyaltyPricing.discountLabel,
                  discountVersion: { increment: 1 },
                }
              : {}),
            version: { increment: 1 },
            lastModifiedAt: now,
            hasModifications: true,
            modificationCount: { increment: 1 },
          },
        });
        if (claimed.count === 0) {
          throw new OrderAddItemsError(
            'Order was modified by another user. Please refresh and try again.',
            'ORDER_VERSION_CONFLICT',
            409
          );
        }

        const updatedOrder = await tx.order.findUnique({
          where: { id: orderId },
        });
        if (!updatedOrder) {
          throw new OrderAddItemsError(
            'Order not found',
            'ORDER_NOT_FOUND',
            404
          );
        }

        const creationEvents = await tx.orderEvent.count({
          where: { orderId, type: ORDER_EVENT_TYPES.CREATED },
        });
        // A PENDING order has no kitchen ticket yet; the later order.created
        // includes these lines exactly once. A live order with creation events
        // gets one add-on ticket per routed station.
        const shouldEmit = current.status !== 'PENDING' && creationEvents > 0;
        let ticket = emptyTicket();
        if (shouldEmit) {
          const event = await recordOrderItemsAdded(
            orderId,
            createdItems.map((item) => item.id),
            { tx }
          );
          ticket = ticketFromEvent(event);
        }

        await recordRestaurantChangeTx(tx, {
          restaurantId,
          entityType: 'order',
          entityId: orderId,
        });

        const addedQuantity = createdItems.reduce(
          (sum, item) => sum + item.quantity,
          0
        );

        await tx.auditLog.create({
          data: {
            tableName: 'orders',
            recordId: orderId,
            operation: 'UPDATE',
            restaurantId,
            changedBy: actor.userId,
            changedByType: actor.userType,
            category: 'orders',
            severity: 'info',
            description: 'order.items.added',
            oldValues: {
              version: current.version,
              status: current.status,
              totalAmount: money(current.totalAmount),
            },
            newValues: {
              version: updatedOrder.version,
              status: updatedOrder.status,
              totalAmount: money(updatedOrder.totalAmount),
              addedLineCount: createdItems.length,
              addedQuantity,
            },
            metadata: {
              orderId,
              operation: 'ADD_ITEMS',
              reason: input.reason,
              addedItemIds: createdItems.map((item) => item.id),
            },
            ipAddress: actor.ipAddress ?? 'unknown',
            userAgent: actor.userAgent ?? null,
          },
        });

        const response: AddOrderItemsResult = {
          order: {
            id: updatedOrder.id,
            status: updatedOrder.status,
            paymentStatus: updatedOrder.paymentStatus,
            version: updatedOrder.version,
            subtotalAmount: money(updatedOrder.subtotalAmount),
            taxAmount: money(updatedOrder.taxAmount),
            serviceCharge: money(updatedOrder.serviceCharge),
            discountAmount: money(updatedOrder.discountAmount),
            totalAmount: money(updatedOrder.totalAmount),
          },
          addedItems: createdItems.map((item) => ({
            id: item.id,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            totalAmount: money(item.totalAmount),
          })),
          ticket,
          isDuplicate: false,
          serverTime: now.toISOString(),
        };

        await tx.orderMutationIdempotency.create({
          data: {
            restaurantId,
            orderId,
            operation: 'ADD_ITEMS',
            idempotencyKey: input.idempotencyKey,
            requestHash: hash,
            responseJson: response as unknown as Prisma.InputJsonValue,
          },
        });

        return {
          kind: 'ok',
          response,
          publish: shouldEmit
            ? {
                orderId,
                restaurantId,
                orderNumber: updatedOrder.orderNumber,
                orderVersion: updatedOrder.version,
                ticketCount: ticket.routed ? ticket.stationIds.length : 0,
              }
            : null,
        };
      },
      { maxWait: 5000, timeout: 10000 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const raced = await prisma.orderMutationIdempotency.findUnique({
        where: scope(orderId, restaurantId, input.idempotencyKey),
      });
      if (raced) {
        if (raced.requestHash !== hash) {
          throw new OrderAddItemsError(
            'Idempotency key was reused with a different request',
            'IDEMPOTENCY_KEY_REUSED',
            409
          );
        }
        return replay(raced.responseJson);
      }
    }
    throw error;
  }

  if (outcome.kind === 'replay') return outcome.response;

  // Best-effort after commit: a lost signal is recovered by the Counter changes
  // feed and polling.
  if (outcome.publish) {
    try {
      await PostgresEventManager.publishOrderItemsAdded({
        ...outcome.publish,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[order-add-items] failed to publish signal:', error);
    }
  }

  return outcome.response;
}
