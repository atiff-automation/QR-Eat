/**
 * Idempotent table-payment service.
 *
 * PAY-01:
 * - one PaymentBatch per idempotency key;
 * - table-scoped transaction lock so two cashiers cannot pay the same orders;
 * - PENDING orders are rejected until confirmed;
 * - replayed requests return the original response;
 * - the caller never computes money.
 */

import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '@/lib/database';
import {
  formatPickupNumber,
  ORDER_WITH_DETAILS_INCLUDE,
  PAYMENT_STATUS,
} from '@/lib/order-utils';
import { SequenceManager } from '@/lib/sequence-manager';

export type CounterPaymentMethod = 'cash' | 'card' | 'ewallet';

export interface ProcessTablePaymentInput {
  tableId: string;
  restaurantId: string;
  userId: string;
  userType: string;
  idempotencyKey: string;
  paymentMethod: CounterPaymentMethod;
  cashReceived?: number;
  externalTransactionId?: string;
  notes?: string;
  /** Optional: must match the full unpaid/confirmed set if supplied. */
  orderIds?: string[];
}

export interface ProcessOrderPaymentInput {
  orderId: string;
  restaurantId: string;
  userId: string;
  userType: string;
  idempotencyKey: string;
  paymentMethod: CounterPaymentMethod;
  cashReceived?: number;
  externalTransactionId?: string;
  notes?: string;
}

export class PaymentServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'PaymentServiceError';
  }
}

export interface PaymentBatchResult {
  replayed: boolean;
  response: Record<string, unknown>;
}

export function buildPaymentRequestHash(
  input: ProcessTablePaymentInput
): string {
  const normalized = {
    tableId: input.tableId,
    paymentMethod: input.paymentMethod,
    cashReceived: input.cashReceived ?? null,
    externalTransactionId: input.externalTransactionId ?? null,
    notes: input.notes ?? null,
    orderIds: input.orderIds ? [...input.orderIds].sort() : null,
  };

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function buildOrderPaymentRequestHash(
  input: ProcessOrderPaymentInput
): string {
  const normalized = {
    orderId: input.orderId,
    paymentMethod: input.paymentMethod,
    cashReceived: input.cashReceived ?? null,
    externalTransactionId: input.externalTransactionId ?? null,
    notes: input.notes ?? null,
  };

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function assertReplayMatches(
  batch: { requestHash: string; restaurantId: string; tableId: string | null },
  requestHash: string,
  input: ProcessTablePaymentInput
): void {
  if (batch.restaurantId !== input.restaurantId) {
    throw new PaymentServiceError(
      'Idempotency key belongs to another restaurant',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }

  if (batch.tableId !== input.tableId) {
    throw new PaymentServiceError(
      'Idempotency key belongs to another table',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }

  if (batch.requestHash !== requestHash) {
    throw new PaymentServiceError(
      'Idempotency key was reused with a different request',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }
}

function getProcessedByFields(
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

/**
 * Process all confirmed unpaid orders on a table in one idempotent batch.
 */
export async function processTablePaymentBatch(
  input: ProcessTablePaymentInput
): Promise<PaymentBatchResult> {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    throw new PaymentServiceError(
      'A valid Idempotency-Key header is required',
      'IDEMPOTENCY_KEY_REQUIRED',
      400
    );
  }

  const requestHash = buildPaymentRequestHash(input);

  // Fast replay path. The transaction re-checks under the table lock.
  const existing = await prisma.paymentBatch.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (existing) {
    assertReplayMatches(existing, requestHash, input);
    return {
      replayed: true,
      response: existing.response as Record<string, unknown>,
    };
  }

  // A receipt number may be burned if the transaction rolls back. That is
  // preferable to creating a payment without a receipt.
  const { number: dailySeq, formatted: receiptNumber } =
    await SequenceManager.getNextReceipt(input.restaurantId);

  const result = await prisma.$transaction(
    async (tx) => {
      // Serialize all payments for this table. Different keys cannot race into
      // a double payment; the second transaction sees the paid orders.
      const lockKey = `table-payment:${input.restaurantId}:${input.tableId}`;
      // pg_advisory_xact_lock returns void. Prisma cannot deserialize a raw
      // void column, so cast it to text while still acquiring the lock.
      await tx.$queryRaw<Array<{ lock: string }>>`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
      `;

      const lockedExisting = await tx.paymentBatch.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });

      if (lockedExisting) {
        assertReplayMatches(lockedExisting, requestHash, input);
        return {
          replayed: true,
          response: lockedExisting.response as Record<string, unknown>,
        };
      }

      const pendingCount = await tx.order.count({
        where: {
          tableId: input.tableId,
          restaurantId: input.restaurantId,
          status: 'PENDING',
          paymentStatus: PAYMENT_STATUS.PENDING,
        },
      });

      if (pendingCount > 0) {
        throw new PaymentServiceError(
          'Confirm all pending orders before taking payment.',
          'ORDER_NOT_CONFIRMED',
          409
        );
      }

      const orders = await tx.order.findMany({
        where: {
          tableId: input.tableId,
          restaurantId: input.restaurantId,
          paymentStatus: PAYMENT_STATUS.PENDING,
          status: { notIn: ['PENDING', 'CANCELLED'] },
        },
        include: ORDER_WITH_DETAILS_INCLUDE,
        orderBy: { createdAt: 'asc' },
      });

      if (orders.length === 0) {
        throw new PaymentServiceError(
          'No eligible unpaid orders found for this table.',
          'NO_ELIGIBLE_ORDERS',
          409
        );
      }

      if (input.orderIds && input.orderIds.length > 0) {
        const requested = [...input.orderIds].sort();
        const eligible = orders.map((order) => order.id).sort();
        if (
          requested.length !== eligible.length ||
          requested.some((id, index) => id !== eligible[index])
        ) {
          throw new PaymentServiceError(
            'The table bill changed. Refresh before taking payment.',
            'BILL_CHANGED',
            409
          );
        }
      }

      const totalAmount = orders.reduce(
        (sum, order) => sum.plus(new Decimal(order.totalAmount)),
        new Decimal(0)
      );

      let cashReceived: Decimal | null = null;
      let changeGiven: Decimal | null = null;

      if (input.paymentMethod === 'cash') {
        cashReceived =
          input.cashReceived !== undefined
            ? new Decimal(input.cashReceived)
            : totalAmount;

        if (cashReceived.lessThan(totalAmount)) {
          throw new PaymentServiceError(
            `Insufficient cash. Total: ${totalAmount}, received: ${cashReceived}`,
            'INSUFFICIENT_CASH',
            400
          );
        }

        changeGiven = cashReceived.minus(totalAmount);
      }

      const batchId = randomUUID();
      const processedBy = getProcessedByFields(input.userId, input.userType);

      await tx.paymentBatch.create({
        data: {
          id: batchId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          restaurantId: input.restaurantId,
          tableId: input.tableId,
          paymentMethod: input.paymentMethod,
          totalAmount,
          cashReceived,
          changeGiven,
          receiptNumber,
          status: 'COMPLETED',
          response: {},
          ...processedBy,
        },
      });

      const payments = [];

      for (let index = 0; index < orders.length; index++) {
        const order = orders[index];
        const orderAmount = new Decimal(order.totalAmount);
        const isFirstOrder = index === 0;

        const updated = await tx.order.updateMany({
          where: {
            id: order.id,
            restaurantId: input.restaurantId,
            paymentStatus: PAYMENT_STATUS.PENDING,
            status: { notIn: ['PENDING', 'CANCELLED'] },
          },
          data: { paymentStatus: PAYMENT_STATUS.PAID },
        });

        if (updated.count !== 1) {
          throw new PaymentServiceError(
            'The table bill changed. Refresh before taking payment.',
            'BILL_CHANGED',
            409
          );
        }

        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            batchId,
            paymentMethod: input.paymentMethod,
            amount: orderAmount,
            processingFee: new Decimal(0),
            netAmount: orderAmount,
            status: 'PAID',
            cashReceived: isFirstOrder ? cashReceived : orderAmount,
            changeGiven: isFirstOrder ? changeGiven : new Decimal(0),
            receiptNumber: `${receiptNumber}-${index + 1}`,
            dailySeq,
            externalTransactionId: input.externalTransactionId,
            paymentMetadata: {
              tablePayment: true,
              primaryReceipt: receiptNumber,
              isFirstOrder,
              orderIndex: index + 1,
              totalOrders: orders.length,
              notes: input.notes,
              idempotencyKey: input.idempotencyKey,
            },
            processedAt: new Date(),
            completedAt: new Date(),
            ...processedBy,
          },
        });

        await tx.auditLog.create({
          data: {
            tableName: 'payments',
            recordId: payment.id,
            operation: 'CREATE',
            newValues: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              amount: orderAmount.toString(),
              receiptNumber,
              tablePayment: true,
              idempotencyKey: input.idempotencyKey,
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

        payments.push(payment);
      }

      const firstOrder = orders[0];
      const combinedPayment = {
        ...payments[0],
        amount: totalAmount.toString(),
        cashReceived: cashReceived?.toString() ?? totalAmount.toString(),
        changeGiven: changeGiven?.toString() ?? '0',
        receiptNumber,
        order: {
          id: firstOrder.id,
          orderNumber: `TABLE-${orders.length}-ORDERS`,
          tableId: input.tableId,
          createdAt: firstOrder.createdAt,
          totalAmount: totalAmount.toString(),
          subtotalAmount: orders
            .reduce(
              (sum, order) => sum.plus(new Decimal(order.subtotalAmount)),
              new Decimal(0)
            )
            .toString(),
          taxAmount: orders
            .reduce(
              (sum, order) => sum.plus(new Decimal(order.taxAmount || 0)),
              new Decimal(0)
            )
            .toString(),
          serviceCharge: orders
            .reduce(
              (sum, order) => sum.plus(new Decimal(order.serviceCharge || 0)),
              new Decimal(0)
            )
            .toString(),
          restaurant: {
            ...firstOrder.restaurant,
          },
          table: {
            id: input.tableId,
            tableNumber: firstOrder.table?.tableNumber || 0,
            tableName:
              firstOrder.table?.tableName ||
              `Table ${firstOrder.table?.tableNumber || ''}`,
            locationDescription: firstOrder.table?.locationDescription,
          },
          items: orders.flatMap((order) =>
            (order.items || []).map((item) => ({
              ...item,
              orderNumber: order.orderNumber,
            }))
          ),
          taxLabel: firstOrder.restaurant.taxLabel || 'Tax',
          serviceChargeLabel:
            firstOrder.restaurant.serviceChargeLabel || 'Service Charge',
        },
      };

      const response = {
        success: true,
        message: `Processed payment for ${orders.length} orders`,
        receiptNumber,
        ordersProcessed: orders.length,
        totalPaid: totalAmount.toString(),
        changeGiven: changeGiven?.toString() || '0',
        payment: combinedPayment,
        payments: payments.map((payment) => ({
          id: payment.id,
          orderId: payment.orderId,
          amount: payment.amount.toString(),
          receiptNumber: payment.receiptNumber,
        })),
        paymentBatchId: batchId,
      };

      const serializableResponse = JSON.parse(
        JSON.stringify(response)
      ) as Prisma.InputJsonValue;

      await tx.paymentBatch.update({
        where: { id: batchId },
        data: { response: serializableResponse },
      });

      return {
        replayed: false,
        response: serializableResponse as Record<string, unknown>,
      };
    },
    { maxWait: 5000, timeout: 15000 }
  );

  return result;
}

function assertOrderReplayMatches(
  batch: {
    requestHash: string;
    restaurantId: string;
    orderId: string | null;
  },
  requestHash: string,
  input: ProcessOrderPaymentInput
): void {
  if (batch.restaurantId !== input.restaurantId) {
    throw new PaymentServiceError(
      'Idempotency key belongs to another restaurant',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }

  if (batch.orderId !== input.orderId) {
    throw new PaymentServiceError(
      'Idempotency key belongs to another order',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }

  if (batch.requestHash !== requestHash) {
    throw new PaymentServiceError(
      'Idempotency key was reused with a different request',
      'IDEMPOTENCY_MISMATCH',
      409
    );
  }
}

/**
 * Process one takeaway order payment. Table payments stay in
 * processTablePaymentBatch.
 */
export async function processOrderPaymentBatch(
  input: ProcessOrderPaymentInput
): Promise<PaymentBatchResult> {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    throw new PaymentServiceError(
      'A valid Idempotency-Key header is required',
      'IDEMPOTENCY_KEY_REQUIRED',
      400
    );
  }

  const requestHash = buildOrderPaymentRequestHash(input);

  const existing = await prisma.paymentBatch.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (existing) {
    assertOrderReplayMatches(existing, requestHash, input);
    return {
      replayed: true,
      response: existing.response as Record<string, unknown>,
    };
  }

  const { number: dailySeq, formatted: receiptNumber } =
    await SequenceManager.getNextReceipt(input.restaurantId);

  const result = await prisma.$transaction(
    async (tx) => {
      const lockKey = `order-payment:${input.restaurantId}:${input.orderId}`;
      await tx.$queryRaw<Array<{ lock: string }>>`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
      `;

      const lockedExisting = await tx.paymentBatch.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });

      if (lockedExisting) {
        assertOrderReplayMatches(lockedExisting, requestHash, input);
        return {
          replayed: true,
          response: lockedExisting.response as Record<string, unknown>,
        };
      }

      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: ORDER_WITH_DETAILS_INCLUDE,
      });

      if (!order || order.restaurantId !== input.restaurantId) {
        throw new PaymentServiceError(
          'Order not found',
          'ORDER_NOT_FOUND',
          404
        );
      }

      if (order.orderType !== 'TAKEAWAY' || order.tableId !== null) {
        throw new PaymentServiceError(
          'This payment endpoint is for takeaway orders only',
          'ORDER_NOT_TAKEAWAY',
          409
        );
      }

      if (order.paymentStatus !== PAYMENT_STATUS.PENDING) {
        throw new PaymentServiceError(
          'Order is already paid or is not payable',
          'ORDER_NOT_PAYABLE',
          409
        );
      }

      if (order.status === 'PENDING' || order.status === 'CANCELLED') {
        throw new PaymentServiceError(
          'Confirm the order before taking payment',
          'ORDER_NOT_CONFIRMED',
          409
        );
      }

      const totalAmount = new Decimal(order.totalAmount);
      let cashReceived: Decimal | null = null;
      let changeGiven: Decimal | null = null;

      if (input.paymentMethod === 'cash') {
        cashReceived =
          input.cashReceived !== undefined
            ? new Decimal(input.cashReceived)
            : totalAmount;

        if (cashReceived.lessThan(totalAmount)) {
          throw new PaymentServiceError(
            `Insufficient cash. Total: ${totalAmount}, received: ${cashReceived}`,
            'INSUFFICIENT_CASH',
            400
          );
        }

        changeGiven = cashReceived.minus(totalAmount);
      }

      const batchId = randomUUID();
      const processedBy = getProcessedByFields(input.userId, input.userType);

      await tx.paymentBatch.create({
        data: {
          id: batchId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          restaurantId: input.restaurantId,
          tableId: null,
          orderId: input.orderId,
          paymentMethod: input.paymentMethod,
          totalAmount,
          cashReceived,
          changeGiven,
          receiptNumber,
          status: 'COMPLETED',
          response: {},
          ...processedBy,
        },
      });

      const updated = await tx.order.updateMany({
        where: {
          id: input.orderId,
          restaurantId: input.restaurantId,
          orderType: 'TAKEAWAY',
          tableId: null,
          paymentStatus: PAYMENT_STATUS.PENDING,
          status: { notIn: ['PENDING', 'CANCELLED'] },
        },
        data: { paymentStatus: PAYMENT_STATUS.PAID },
      });

      if (updated.count !== 1) {
        throw new PaymentServiceError(
          'The order changed. Refresh before taking payment.',
          'ORDER_CHANGED',
          409
        );
      }

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          batchId,
          paymentMethod: input.paymentMethod,
          amount: totalAmount,
          processingFee: new Decimal(0),
          netAmount: totalAmount,
          status: 'PAID',
          cashReceived,
          changeGiven,
          receiptNumber,
          dailySeq,
          externalTransactionId: input.externalTransactionId,
          paymentMetadata: {
            orderPayment: true,
            orderNumber: order.orderNumber,
            pickupNumber: formatPickupNumber(order.dailySeq),
            notes: input.notes,
            idempotencyKey: input.idempotencyKey,
          },
          processedAt: new Date(),
          completedAt: new Date(),
          ...processedBy,
        },
      });

      await tx.auditLog.create({
        data: {
          tableName: 'payments',
          recordId: payment.id,
          operation: 'CREATE',
          newValues: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            pickupNumber: formatPickupNumber(order.dailySeq),
            amount: totalAmount.toString(),
            receiptNumber,
            orderPayment: true,
            idempotencyKey: input.idempotencyKey,
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

      const pickupNumber = formatPickupNumber(order.dailySeq);
      const response = {
        success: true,
        message: `Processed payment for order ${order.orderNumber}`,
        receiptNumber,
        ordersProcessed: 1,
        totalPaid: totalAmount.toString(),
        changeGiven: changeGiven?.toString() || '0',
        payment: {
          ...payment,
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            orderType: order.orderType,
            pickupNumber,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            tableId: null,
            table: null,
            createdAt: order.createdAt,
            totalAmount: totalAmount.toString(),
            subtotalAmount: order.subtotalAmount.toString(),
            taxAmount: order.taxAmount.toString(),
            serviceCharge: order.serviceCharge.toString(),
            restaurant: {
              ...order.restaurant,
            },
            items: order.items,
            taxLabel: order.restaurant.taxLabel || 'Tax',
            serviceChargeLabel:
              order.restaurant.serviceChargeLabel || 'Service Charge',
          },
        },
        payments: [
          {
            id: payment.id,
            orderId: payment.orderId,
            amount: payment.amount.toString(),
            receiptNumber: payment.receiptNumber,
          },
        ],
        paymentBatchId: batchId,
      };

      const serializableResponse = JSON.parse(
        JSON.stringify(response)
      ) as Prisma.InputJsonValue;

      await tx.paymentBatch.update({
        where: { id: batchId },
        data: { response: serializableResponse },
      });

      return {
        replayed: false,
        response: serializableResponse as Record<string, unknown>,
      };
    },
    { maxWait: 5000, timeout: 15000 }
  );

  return result;
}
