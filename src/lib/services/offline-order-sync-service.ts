/**
 * Offline Counter order sync.
 *
 * The Counter creates the order and prints the kitchen chit locally. This
 * service creates the canonical server order later, using the same pricing and
 * dispatch path as an online Counter order. The local price snapshot is kept
 * for audit; any variance is recorded and returned to the Counter.
 */

import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  CounterOrderError,
  createCounterOrder,
  type CounterOrderActor,
  type CounterOrderInput,
} from '@/lib/services/counter-order-service';
import {
  OrderDispatchError,
  confirmPendingOrder,
} from '@/lib/services/order-dispatch-service';

export const OfflineOrderInputSchema = z
  .object({
    clientOrderId: z.string().min(8).max(100),
    deviceId: z.string().max(100).optional().nullable(),
    orderType: z.enum(['DINE_IN', 'TAKEAWAY']).default('DINE_IN'),
    tableId: z.string().uuid().optional().nullable(),
    customerName: z.string().trim().max(100).optional().nullable(),
    customerPhone: z.string().trim().max(20).optional().nullable(),
    specialInstructions: z.string().max(500).optional().nullable(),
    createdAtDevice: z.string().optional().nullable(),
    items: z
      .array(
        z.object({
          clientItemId: z.string().min(1).max(100),
          menuItemId: z.string().uuid('Invalid menu item'),
          quantity: z.number().int().min(1).max(99),
          optionIds: z.array(z.string().uuid()).max(40).optional(),
          notes: z.string().max(300).optional().nullable(),
        })
      )
      .min(1)
      .max(100),
    priceSnapshot: z
      .object({
        currency: z.string().max(10).optional(),
        subtotal: z.string(),
        tax: z.string(),
        service: z.string(),
        total: z.string(),
        taxRate: z.string().optional(),
        serviceRate: z.string().optional(),
      })
      .optional()
      .nullable(),
    kitchen: z
      .object({
        printedAtDevice: z.string().optional().nullable(),
        deliveredViaLan: z.boolean().optional(),
        paperChitPrinted: z.boolean().optional(),
      })
      .optional()
      .nullable(),
  })
  .superRefine((value, context) => {
    if (value.orderType === 'DINE_IN' && !value.tableId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tableId'],
        message: 'A table is required for a dine-in order.',
      });
    }
    if (value.orderType === 'TAKEAWAY' && value.tableId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tableId'],
        message: 'A takeaway order cannot have a table.',
      });
    }
  });

export type OfflineOrderInput = z.infer<typeof OfflineOrderInputSchema>;

export interface OfflineOrderSyncResult {
  clientOrderId: string;
  replayed: boolean;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    orderType: string;
    totalAmount: string;
    tableId: string | null;
    tableNumber: string | null;
    tableName: string | null;
    createdAt: string;
  };
  itemIds: Record<string, string>;
  priceVariance: {
    localTotal: string;
    serverTotal: string;
    difference: string;
  } | null;
  serverTime: string;
}

function toOrderPayload(order: {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  orderType: string;
  totalAmount: { toString(): string };
  tableId: string | null;
  table?: { tableNumber: string; tableName: string | null } | null;
  createdAt: Date;
}): OfflineOrderSyncResult['order'] {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    orderType: order.orderType,
    totalAmount: order.totalAmount.toString(),
    tableId: order.tableId,
    tableNumber: order.table?.tableNumber ?? null,
    tableName: order.table?.tableName ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

function parseDeviceDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function varianceFor(
  localTotal: string | undefined,
  serverTotal: string
): OfflineOrderSyncResult['priceVariance'] {
  if (!localTotal) return null;
  const local = Number(localTotal);
  const server = Number(serverTotal);
  if (!Number.isFinite(local) || !Number.isFinite(server)) return null;
  const difference = Number((server - local).toFixed(2));
  if (Math.abs(difference) < 0.01) return null;
  return {
    localTotal: local.toFixed(2),
    serverTotal: server.toFixed(2),
    difference: difference.toFixed(2),
  };
}

export async function syncOfflineOrder(
  input: OfflineOrderInput,
  actor: CounterOrderActor,
  idempotencyKey: string
): Promise<OfflineOrderSyncResult> {
  if (!actor.restaurantId) {
    throw new CounterOrderError(
      'Restaurant context is required',
      'RESTAURANT_CONTEXT_REQUIRED',
      400
    );
  }

  const existing = await prisma.order.findUnique({
    where: { clientOrderId: input.clientOrderId },
    include: {
      table: { select: { tableNumber: true, tableName: true } },
      items: { select: { id: true, clientItemId: true } },
    },
  });

  if (existing) {
    if (existing.restaurantId !== actor.restaurantId) {
      throw new CounterOrderError(
        'Client order belongs to another restaurant',
        'CLIENT_ORDER_MISMATCH',
        409
      );
    }

    let replayOrder = existing;
    if (existing.status === 'PENDING') {
      // A previous create committed but did not finish kitchen dispatch.
      // Replay must resume that work; returning PENDING would let the client
      // map item IDs and immediately send kitchen actions the server rejects.
      try {
        const confirmed = await confirmPendingOrder({
          orderId: existing.id,
          actor,
          offlineDelivered: true,
          paperChitPrinted: input.kitchen?.paperChitPrinted === true,
        });
        replayOrder = confirmed.order;
      } catch (error) {
        if (error instanceof OrderDispatchError) {
          throw new CounterOrderError(
            error.message,
            error.code,
            error.statusCode
          );
        }
        throw error;
      }
    }

    return {
      clientOrderId: input.clientOrderId,
      replayed: true,
      order: toOrderPayload(replayOrder),
      itemIds: Object.fromEntries(
        existing.items
          .filter((item) => item.clientItemId)
          .map((item) => [item.clientItemId as string, item.id])
      ),
      priceVariance:
        (existing.priceVariance as OfflineOrderSyncResult['priceVariance']) ??
        null,
      serverTime: new Date().toISOString(),
    };
  }

  const orderInput: CounterOrderInput = {
    clientOrderId: input.clientOrderId,
    orderType: input.orderType,
    tableId: input.tableId ?? null,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    specialInstructions: input.specialInstructions ?? null,
    items: input.items.map((item) => ({
      clientItemId: item.clientItemId,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      optionIds: item.optionIds ?? [],
      notes: item.notes ?? null,
    })),
    sendToKitchen: true,
  };

  const result = await createCounterOrder(orderInput, actor, idempotencyKey, {
    offlineDelivered: true,
    offlineDeviceId: input.deviceId ?? undefined,
    offlineCreatedAt: parseDeviceDate(input.createdAtDevice),
    paperChitPrinted: input.kitchen?.paperChitPrinted === true,
    ipAddress: null,
  });

  const itemIds = await prisma.orderItem.findMany({
    where: { orderId: result.order.id },
    select: { id: true, clientItemId: true },
  });

  const priceVariance = varianceFor(
    input.priceSnapshot?.total,
    result.order.totalAmount
  );
  if (priceVariance) {
    await prisma.order.update({
      where: { id: result.order.id },
      data: { priceVariance },
    });
  }

  return {
    clientOrderId: input.clientOrderId,
    replayed: result.replayed,
    order: {
      id: result.order.id,
      orderNumber: result.order.orderNumber,
      status: result.order.status,
      paymentStatus: result.order.paymentStatus,
      orderType: result.order.orderType,
      totalAmount: result.order.totalAmount,
      tableId: result.order.tableId,
      tableNumber: result.order.tableNumber,
      tableName: result.order.tableName,
      createdAt: result.order.createdAt,
    },
    itemIds: Object.fromEntries(
      itemIds
        .filter((item) => item.clientItemId)
        .map((item) => [item.clientItemId as string, item.id])
    ),
    priceVariance,
    serverTime: new Date().toISOString(),
  };
}
