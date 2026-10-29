import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { recordOrderStatusChanged } from '@/lib/order-events';
import { SequenceManager } from '@/lib/sequence-manager';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import type { CancelOrderInput } from '@/lib/validation/order-modification-schemas';
import {
  assertOrderAdjustmentAction,
  getOrderAdjustmentPolicy,
  OrderAdjustmentAction,
  OrderAdjustmentError,
} from '@/lib/orders/order-adjustment-policy';
import { isOrderBusinessDayClosed } from '@/lib/orders/order-business-day';

export interface OrderAdjustmentActor {
  userId: string;
  userType: string;
  roleTemplate?: string | null;
  permissions?: string[] | Record<string, string[]>;
  isAdmin?: boolean;
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
  actor: OrderAdjustmentActor
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
      idempotencyKey: input.idempotencyKey,
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

  const policy = await resolvePolicy(restaurantId, order, actor);
  assertOrderAdjustmentAction(policy, expected);

  if (order.version !== input.version) {
    throw new OrderAdjustmentError(
      'Order was modified by another user. Please refresh and try again.',
      'ORDER_VERSION_CONFLICT',
      409
    );
  }

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

  const result = await prisma.$transaction(
    async (tx) => {
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
      if (current.version !== input.version) {
        throw new OrderAdjustmentError(
          'Order was modified by another user. Please refresh and try again.',
          'ORDER_VERSION_CONFLICT',
          409
        );
      }

      const duplicate = await tx.orderModification.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (duplicate) {
        return {
          replayed: true,
          orderStatus: current.status,
          paymentStatus: current.paymentStatus,
        };
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

      await createAdjustmentRecord(tx, current, input, actor);

      const nextPaymentStatus = shouldRefund
        ? 'REFUNDED'
        : current.paymentStatus;

      await tx.order.update({
        where: { id: orderId },
        data: {
          ...(expected === 'CANCEL' || expected === 'VOID'
            ? { status: 'CANCELLED' as const }
            : {}),
          paymentStatus: nextPaymentStatus,
          version: { increment: 1 },
          lastModifiedAt: new Date(),
        },
      });

      if (expected === 'CANCEL' || expected === 'VOID') {
        await autoUpdateTableStatus(current.tableId, tx);
      }

      return {
        replayed: false,
        orderStatus: expected === 'REFUND' ? current.status : 'CANCELLED',
        paymentStatus: nextPaymentStatus,
      };
    },
    { maxWait: 5000, timeout: 10000 }
  );

  if (!result.replayed) {
    if (expected === 'CANCEL' || expected === 'VOID') {
      try {
        await recordOrderStatusChanged(orderId, order.status, 'CANCELLED', {
          reason: input.reason,
        });
      } catch (error) {
        console.error('[order-events] failed to record adjustment:', error);
      }
    }

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
        ipAddress: 'server',
        userAgent: 'order-adjustment',
        metadata: {
          orderId,
          reason: input.reason,
          previousStatus: order.status,
          refundAmount,
          replayed: false,
        },
      }
    );
  }

  return {
    action: expected,
    replayed: result.replayed,
    orderId,
    orderStatus: result.orderStatus,
    paymentStatus: result.paymentStatus,
    refundAmount,
    message: result.replayed
      ? 'This adjustment was already recorded.'
      : adjustmentMessage(expected, refundAmount),
  };
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
