import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import {
  recordOrderStatusChanged,
  type CancelledTotals,
} from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SequenceManager } from '@/lib/sequence-manager';
import { recordRestaurantChangeTx } from '@/lib/restaurant-changes';
import type { CancelOrderInput } from '@/lib/validation/order-modification-schemas';
import {
  assertOrderAdjustmentAction,
  getOrderAdjustmentPolicy,
  OrderAdjustmentAction,
  OrderAdjustmentError,
} from '@/lib/orders/order-adjustment-policy';
import { isOrderBusinessDayClosed } from '@/lib/orders/order-business-day';
import {
  buildOrderMutationRequestHash,
  deriveOrderModificationKey,
} from '@/lib/orders/order-mutation-idempotency';

export interface OrderAdjustmentActor {
  userId: string;
  userType: string;
  roleTemplate?: string | null;
  permissions?: string[] | Record<string, string[]>;
  isAdmin?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface OrderAdjustmentResult {
  action: Exclude<OrderAdjustmentAction, 'NONE'>;
  replayed: boolean;
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  refundAmount: number;
  message: string;
}

const ADJUSTMENT_ORDER_INCLUDE = {
  payments: { where: { status: 'PAID' as const } },
} satisfies Prisma.OrderInclude;

type AdjustmentOrder = Prisma.OrderGetPayload<{
  include: typeof ADJUSTMENT_ORDER_INCLUDE;
}>;

function money(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function cancelScope(restaurantId: string, orderId: string, key: string) {
  return {
    restaurantId_orderId_operation_idempotencyKey: {
      restaurantId,
      orderId,
      operation: 'CANCEL' as const,
      idempotencyKey: key,
    },
  };
}

function cancelHash(orderId: string, input: CancelOrderInput): string {
  return buildOrderMutationRequestHash('CANCEL', orderId, {
    version: input.version,
    reason: input.reason,
    reasonNotes: input.reasonNotes ?? null,
    customerNotified: input.customerNotified,
  });
}

function replayCancel(
  responseJson: Prisma.JsonValue | null
): OrderAdjustmentResult {
  if (!responseJson || typeof responseJson !== 'object') {
    throw new OrderAdjustmentError(
      'Stored idempotency response is missing',
      'IDEMPOTENCY_RESPONSE_MISSING',
      500
    );
  }
  return {
    ...(responseJson as unknown as OrderAdjustmentResult),
    replayed: true,
    message: 'This adjustment was already recorded.',
  };
}

async function findOrder(
  restaurantId: string,
  orderId: string
): Promise<AdjustmentOrder | null> {
  return prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: ADJUSTMENT_ORDER_INCLUDE,
  });
}

async function resolvePolicy(
  restaurantId: string,
  order: AdjustmentOrder,
  actor: OrderAdjustmentActor
) {
  const businessDayClosed = await isOrderBusinessDayClosed(
    restaurantId,
    order.createdAt
  );
  return getOrderAdjustmentPolicy({
    status: order.status,
    paymentStatus: order.paymentStatus,
    orderType: order.orderType,
    businessDayClosed,
    userType: actor.userType,
    roleTemplate: actor.roleTemplate,
    permissions: actor.permissions,
  });
}

async function createRefundPayment(
  tx: Prisma.TransactionClient,
  order: AdjustmentOrder,
  originalPayment: AdjustmentOrder['payments'][number],
  amount: number,
  reason: string,
  notes: string | undefined,
  actor: OrderAdjustmentActor,
  idempotencyKey: string
) {
  const { number: refundDailySeq, formatted: refundReceiptNumber } =
    await SequenceManager.getNextReceipt(order.restaurantId);

  await tx.payment.create({
    data: {
      orderId: order.id,
      paymentMethod: originalPayment.paymentMethod,
      amount: -amount,
      processingFee: 0,
      netAmount: -amount,
      status: 'PAID',
      processedBy: actor.userId,
      processedByType: actor.userType,
      receiptNumber: refundReceiptNumber,
      dailySeq: refundDailySeq,
      paymentMetadata: {
        refundReason: reason,
        refundNotes: notes,
        originalPaymentId: originalPayment.id,
        refundType: 'full',
        refundIdempotencyKey: idempotencyKey,
        orderStatusAtRefund: order.status,
      },
      processedAt: new Date(),
      completedAt: new Date(),
      ...(actor.userType === 'platform_admin'
        ? { processedByAdminId: actor.userId }
        : actor.userType === 'restaurant_owner'
          ? { processedByOwnerId: actor.userId }
          : { processedByStaffId: actor.userId }),
    },
  });
}

async function createAdjustmentRecord(
  tx: Prisma.TransactionClient,
  order: AdjustmentOrder,
  input: CancelOrderInput,
  actor: OrderAdjustmentActor,
  expected: Exclude<OrderAdjustmentAction, 'NONE'>
) {
  await tx.orderModification.create({
    data: {
      order: { connect: { id: order.id } },
      modifiedBy: actor.userId,
      reason: input.reason,
      reasonNotes: input.reasonNotes,
      oldTotal: order.totalAmount,
      newTotal: 0,
      customerNotified: input.customerNotified,
      notifiedAt: input.customerNotified ? new Date() : null,
      // `OrderModification.idempotencyKey` stays globally unique. B3 derives a
      // scoped key for CANCEL; VOID/REFUND keep the legacy client key.
      idempotencyKey:
        expected === 'CANCEL'
          ? deriveOrderModificationKey('CANCEL', order.id, input.idempotencyKey)
          : input.idempotencyKey,
    },
  });
}

function adjustmentMessage(
  action: Exclude<OrderAdjustmentAction, 'NONE'>,
  refundAmount: number
): string {
  if (action === 'CANCEL') {
    return refundAmount > 0
      ? `Order cancelled. Full refund of ${refundAmount.toFixed(2)} recorded.`
      : 'Order cancelled successfully.';
  }
  if (action === 'VOID') {
    return 'Order voided. No payment was refunded.';
  }
  return `Full refund of ${refundAmount.toFixed(2)} recorded. Order remains served.`;
}

function auditDescription(
  action: Exclude<OrderAdjustmentAction, 'NONE'>
): string {
  if (action === 'CANCEL') return 'order.cancelled';
  if (action === 'VOID') return 'order.voided';
  return 'order.refunded';
}

interface AdjustmentTransactionResult {
  replayed: boolean;
  response?: OrderAdjustmentResult;
  replayResponse?: OrderAdjustmentResult;
  orderNumber?: string;
  orderVersion?: number;
  previousStatus?: string;
  tableId?: string | null;
  ticketCount?: number;
  statusChanged?: boolean;
}

async function runAdjustment(
  restaurantId: string,
  orderId: string,
  actor: OrderAdjustmentActor,
  input: CancelOrderInput,
  expected: Exclude<OrderAdjustmentAction, 'NONE'>
): Promise<OrderAdjustmentResult> {
  const order = await findOrder(restaurantId, orderId);
  if (!order) {
    throw new OrderAdjustmentError('Order not found', 'ORDER_NOT_FOUND', 404);
  }

  const isCancel = expected === 'CANCEL';
  const hash = isCancel ? cancelHash(orderId, input) : null;

  // A replay is decided before policy/version: the successful request already
  // moved the order to CANCELLED. A different body under the same key is a
  // reuse error, never a second mutation.
  if (isCancel) {
    const existing = await prisma.orderMutationIdempotency.findUnique({
      where: cancelScope(restaurantId, orderId, input.idempotencyKey),
    });
    if (existing) {
      if (existing.requestHash !== hash) {
        throw new OrderAdjustmentError(
          'Idempotency key was reused with a different request',
          'IDEMPOTENCY_KEY_REUSED',
          409
        );
      }
      return replayCancel(existing.responseJson);
    }
  }

  const policy = await resolvePolicy(restaurantId, order, actor);
  assertOrderAdjustmentAction(policy, expected);

  if (order.version !== input.version) {
    throw new OrderAdjustmentError(
      'Order was modified by another user. Please refresh and try again.',
      'ORDER_VERSION_CONFLICT',
      409
    );
  }

  // VOID/REFUND keep the legacy global key lookup (B3 residual risk).
  if (!isCancel) {
    const existing = await prisma.orderModification.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return {
        action: expected,
        replayed: true,
        orderId: order.id,
        orderStatus: order.status,
        paymentStatus: order.paymentStatus,
        refundAmount: 0,
        message: 'This adjustment was already recorded.',
      };
    }
  }

  const shouldRefund =
    expected === 'REFUND' ||
    (expected === 'CANCEL' && order.paymentStatus === 'PAID');
  const refundAmount = shouldRefund ? Number(order.totalAmount) : 0;
  const originalPayment = order.payments[0];

  if (shouldRefund && !originalPayment) {
    throw new OrderAdjustmentError(
      'No captured payment was found for this order.',
      'REFUND_PAYMENT_NOT_FOUND',
      409
    );
  }

  let transactionResult: AdjustmentTransactionResult;
  try {
    transactionResult = await prisma.$transaction(
      async (tx): Promise<AdjustmentTransactionResult> => {
        const current = await tx.order.findFirst({
          where: { id: orderId, restaurantId },
          include: ADJUSTMENT_ORDER_INCLUDE,
        });
        if (!current) {
          throw new OrderAdjustmentError(
            'Order not found',
            'ORDER_NOT_FOUND',
            404
          );
        }

        if (isCancel) {
          // Re-check under the transaction: a concurrent duplicate that
          // committed while this request waited must replay, not refund twice.
          const lockedReceipt = await tx.orderMutationIdempotency.findUnique({
            where: cancelScope(restaurantId, orderId, input.idempotencyKey),
          });
          if (lockedReceipt) {
            if (lockedReceipt.requestHash !== hash) {
              throw new OrderAdjustmentError(
                'Idempotency key was reused with a different request',
                'IDEMPOTENCY_KEY_REUSED',
                409
              );
            }
            return {
              replayed: true,
              replayResponse: replayCancel(lockedReceipt.responseJson),
            };
          }
        } else {
          const duplicate = await tx.orderModification.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (duplicate) {
            return {
              replayed: true,
              response: {
                action: expected,
                replayed: true,
                orderId: current.id,
                orderStatus: current.status,
                paymentStatus: current.paymentStatus,
                refundAmount: 0,
                message: 'This adjustment was already recorded.',
              },
            };
          }
        }

        if (current.version !== input.version) {
          throw new OrderAdjustmentError(
            'Order was modified by another user. Please refresh and try again.',
            'ORDER_VERSION_CONFLICT',
            409
          );
        }

        if (shouldRefund && originalPayment) {
          await createRefundPayment(
            tx,
            current,
            originalPayment,
            refundAmount,
            input.reason,
            input.reasonNotes,
            actor,
            input.idempotencyKey
          );
        }

        await createAdjustmentRecord(tx, current, input, actor, expected);

        const nextPaymentStatus = shouldRefund
          ? 'REFUNDED'
          : current.paymentStatus;
        const nextStatus =
          expected === 'CANCEL' || expected === 'VOID'
            ? ('CANCELLED' as const)
            : current.status;

        // Claim the write against the version read under the transaction. A
        // concurrent add-items/status/cancel that committed first leaves this
        // at count 0; the transaction (including any refund) rolls back.
        const claimed = await tx.order.updateMany({
          where: { id: orderId, version: current.version },
          data: {
            ...(expected === 'CANCEL' || expected === 'VOID'
              ? { status: nextStatus }
              : {}),
            paymentStatus: nextPaymentStatus,
            version: { increment: 1 },
            lastModifiedAt: new Date(),
          },
        });
        if (claimed.count === 0) {
          throw new OrderAdjustmentError(
            'Order was modified by another user. Please refresh and try again.',
            'ORDER_VERSION_CONFLICT',
            409
          );
        }

        const updated = await tx.order.findUnique({ where: { id: orderId } });
        if (!updated) {
          throw new OrderAdjustmentError(
            'Order not found',
            'ORDER_NOT_FOUND',
            404
          );
        }

        if (expected === 'CANCEL' || expected === 'VOID') {
          await autoUpdateTableStatus(current.tableId, tx);
        }

        const cancelledTotals: CancelledTotals = {
          subtotal: money(current.subtotalAmount),
          taxAmount: money(current.taxAmount),
          serviceCharge: money(current.serviceCharge),
          discountAmount: money(current.discountAmount),
          totalAmount: money(current.totalAmount),
        };

        // One chit per station that already received a printable ticket. A
        // PENDING/no-ticket order and a VOID/REFUND produce none.
        let ticketCount = 0;
        if (expected === 'CANCEL') {
          ticketCount = await recordOrderStatusChanged(
            orderId,
            current.status,
            'CANCELLED',
            {
              tx,
              reason: input.reason,
              cancelledTotals,
            }
          );
        }

        // B3 deliberate exception: the change row is part of the mutation, so
        // a failure rolls the whole transaction back.
        await recordRestaurantChangeTx(tx, {
          restaurantId,
          entityType: 'order',
          entityId: orderId,
        });

        const response: OrderAdjustmentResult = {
          action: expected,
          replayed: false,
          orderId,
          orderStatus: updated.status,
          paymentStatus: updated.paymentStatus,
          refundAmount,
          message: adjustmentMessage(expected, refundAmount),
        };

        // Durable audit in the same transaction. No reason notes, item text or
        // customer PII.
        await tx.auditLog.create({
          data: {
            tableName: 'orders',
            recordId: orderId,
            operation: 'UPDATE',
            restaurantId,
            changedBy: actor.userId,
            changedByType: actor.userType,
            category: 'orders',
            severity: 'high',
            description: auditDescription(expected),
            oldValues: {
              status: current.status,
              paymentStatus: current.paymentStatus,
              totalAmount: money(current.totalAmount),
            },
            newValues: {
              status: updated.status,
              paymentStatus: updated.paymentStatus,
              refundAmount,
              version: updated.version,
            },
            metadata: {
              orderId,
              action: expected,
              reason: input.reason,
              refundAmount,
              previousStatus: current.status,
            },
            ipAddress: actor.ipAddress ?? 'unknown',
            userAgent: actor.userAgent ?? null,
          },
        });

        if (isCancel) {
          await tx.orderMutationIdempotency.create({
            data: {
              restaurantId,
              orderId,
              operation: 'CANCEL',
              idempotencyKey: input.idempotencyKey,
              requestHash: hash!,
              responseJson: response as unknown as Prisma.InputJsonValue,
            },
          });
        }

        return {
          replayed: false,
          response,
          orderNumber: updated.orderNumber,
          orderVersion: updated.version,
          previousStatus: current.status,
          tableId: updated.tableId,
          ticketCount,
          statusChanged: updated.status !== current.status,
        };
      },
      { maxWait: 5000, timeout: 10000 }
    );
  } catch (error) {
    if (
      isCancel &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const raced = await prisma.orderMutationIdempotency.findUnique({
        where: cancelScope(restaurantId, orderId, input.idempotencyKey),
      });
      if (raced) {
        if (raced.requestHash !== hash) {
          throw new OrderAdjustmentError(
            'Idempotency key was reused with a different request',
            'IDEMPOTENCY_KEY_REUSED',
            409
          );
        }
        return replayCancel(raced.responseJson);
      }
    }
    throw error;
  }

  if (transactionResult.replayResponse) {
    return transactionResult.replayResponse;
  }
  if (transactionResult.replayed && transactionResult.response) {
    return transactionResult.response;
  }

  const response = transactionResult.response!;

  // The in-transaction `audit_logs` row is the primary durable audit. Keep the
  // existing best-effort security-event stream for cancel/void/refund
  // analytics; a failure here never fails a committed mutation.
  try {
    await AuditLogger.logSecurityEvent(
      actor.userId,
      expected === 'CANCEL'
        ? 'ORDER_CANCELLED'
        : expected === 'VOID'
          ? 'ORDER_VOIDED'
          : 'ORDER_REFUNDED',
      'high',
      `${expected === 'REFUND' ? 'Refund' : expected} for order ${orderId}`,
      {
        ipAddress: actor.ipAddress ?? 'unknown',
        userAgent: actor.userAgent ?? 'order-adjustment',
        metadata: {
          orderId,
          action: expected,
          reason: input.reason,
          previousStatus: transactionResult.previousStatus,
          refundAmount,
          replayed: false,
        },
      }
    );
  } catch (error) {
    console.error('[order-adjustment] failed to write security event:', error);
  }

  // SSE is best-effort and after commit. CANCEL has its own additive signal;
  // VOID reuses order_status_changed when the status moved; REFUND relies on
  // the durable change row.
  try {
    if (expected === 'CANCEL') {
      await PostgresEventManager.publishOrderCancelled({
        orderId,
        restaurantId,
        orderNumber: transactionResult.orderNumber!,
        orderVersion: transactionResult.orderVersion!,
        ticketCount: transactionResult.ticketCount ?? 0,
        timestamp: Date.now(),
      });
    } else if (expected === 'VOID' && transactionResult.statusChanged) {
      await PostgresEventManager.publishOrderStatusChange({
        orderId,
        oldStatus: transactionResult.previousStatus!,
        newStatus: 'CANCELLED',
        restaurantId,
        tableId: transactionResult.tableId ?? null,
        orderNumber: transactionResult.orderNumber!,
        timestamp: Date.now(),
        changedBy: actor.userId,
      });
    }
  } catch (error) {
    console.error('[order-adjustment] failed to publish signal:', error);
  }

  return response;
}

export function cancelOrderAdjustment(
  restaurantId: string,
  orderId: string,
  actor: OrderAdjustmentActor,
  input: CancelOrderInput
) {
  return runAdjustment(restaurantId, orderId, actor, input, 'CANCEL');
}

export function voidOrderAdjustment(
  restaurantId: string,
  orderId: string,
  actor: OrderAdjustmentActor,
  input: CancelOrderInput
) {
  return runAdjustment(restaurantId, orderId, actor, input, 'VOID');
}

export function refundOrderAdjustment(
  restaurantId: string,
  orderId: string,
  actor: OrderAdjustmentActor,
  input: CancelOrderInput
) {
  return runAdjustment(restaurantId, orderId, actor, input, 'REFUND');
}

export function orderAdjustmentErrorResponse(error: unknown) {
  if (error instanceof OrderAdjustmentError) {
    return {
      body: {
        success: false,
        error: error.message,
        code: error.code,
      },
      status: error.statusCode,
    };
  }
  return null;
}
