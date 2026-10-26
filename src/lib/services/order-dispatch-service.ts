import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import {
  recordOrderCreated,
  recordOrderStatusChanged,
  type OrderCreatedResult,
} from '@/lib/order-events';
import { aggregateTicketStatus } from '@/lib/counter/ticket-status';
import { COUNTER_STATION_ONLINE_WINDOW_MS } from '@/lib/counter/constants';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';

export class OrderDispatchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 409
  ) {
    super(message);
    this.name = 'OrderDispatchError';
  }
}

export interface DispatchActor {
  userId: string;
  userType: string;
  isAdmin?: boolean;
}

export interface ConfirmOrderInput {
  orderId: string;
  actor: DispatchActor;
  overrideStation?: boolean;
  estimatedReadyTime?: string | null;
  ipAddress?: string | null;
  stationOverride?: boolean;
}

export interface OrderDispatchTicket {
  routed: boolean;
  stationIds: string[];
  unroutedItemIds: string[];
  replayed: boolean;
  error?: string | null;
  ticketStatus: string;
}

export interface ConfirmOrderResult {
  order: Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
  ticket: OrderDispatchTicket;
  replayed: boolean;
}

const ORDER_INCLUDE = {
  table: {
    select: {
      tableNumber: true,
      tableName: true,
    },
  },
  customerSession: {
    select: {
      customerName: true,
      customerPhone: true,
    },
  },
  items: {
    include: {
      menuItem: {
        select: {
          name: true,
          preparationTime: true,
        },
      },
    },
  },
} satisfies Prisma.OrderInclude;

type ConfirmedOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

async function ticketForOrder(orderId: string): Promise<OrderDispatchTicket> {
  const events = await prisma.orderEvent.findMany({
    where: {
      orderId,
      type: { in: ['order.created', 'order.items.added'] },
    },
    select: { stationId: true, printStatus: true, printedAt: true },
  });
  const aggregate = aggregateTicketStatus(events);
  return {
    routed: events.length > 0,
    stationIds: [...new Set(events.map((event) => event.stationId))],
    unroutedItemIds: [],
    replayed: true,
    ticketStatus: aggregate.aggregate,
  };
}

/**
 * Confirm a PENDING order and dispatch the same kitchen events used by the QR
 * confirmation route. Callers remain responsible for authorization; this
 * service owns the state transition, station guard, ticket/event writes,
 * notifications, audit and table refresh.
 */
export async function confirmPendingOrder(
  input: ConfirmOrderInput
): Promise<ConfirmOrderResult> {
  const currentOrder = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { restaurant: { select: { id: true } } },
  });

  if (!currentOrder) {
    throw new OrderDispatchError('Order not found', 'ORDER_NOT_FOUND', 404);
  }

  if (currentOrder.status === 'CONFIRMED') {
    return {
      order: await prisma.order.findUniqueOrThrow({
        where: { id: input.orderId },
        include: ORDER_INCLUDE,
      }),
      ticket: await ticketForOrder(input.orderId),
      replayed: true,
    };
  }

  if (currentOrder.status !== 'PENDING') {
    throw new OrderDispatchError(
      `Order cannot be confirmed from ${currentOrder.status}`,
      'ORDER_NOT_SENDABLE',
      409
    );
  }

  const stationOverride = input.overrideStation === true;
  if (!stationOverride) {
    const onlineWindow = new Date(
      Date.now() - COUNTER_STATION_ONLINE_WINDOW_MS
    );
    const onlineDevice = await prisma.device.findFirst({
      where: {
        restaurantId: currentOrder.restaurantId,
        isActive: true,
        station: { isActive: true },
        lastSeenAt: { gte: onlineWindow },
      },
      select: { id: true },
    });

    if (!onlineDevice) {
      throw new OrderDispatchError(
        'Kitchen station is offline. Fix the station or use an explicit manager override.',
        'STATION_OFFLINE',
        409
      );
    }
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: {
        id: input.orderId,
        status: 'PENDING',
        version: currentOrder.version,
      },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedBy: input.actor.userId,
        updatedAt: new Date(),
        version: { increment: 1 },
        ...(input.estimatedReadyTime
          ? { estimatedReadyTime: new Date(input.estimatedReadyTime) }
          : {}),
      },
    });
    if (claimed.count === 0) return null;
    return tx.order.findUnique({
      where: { id: input.orderId },
      include: ORDER_INCLUDE,
    });
  });

  if (!updatedOrder) {
    const latest = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, orderNumber: true, status: true },
    });
    if (latest?.status === 'CONFIRMED') {
      return {
        order: await prisma.order.findUniqueOrThrow({
          where: { id: input.orderId },
          include: ORDER_INCLUDE,
        }),
        ticket: await ticketForOrder(input.orderId),
        replayed: true,
      };
    }
    throw new OrderDispatchError(
      'Order changed while this action was being processed. Reload and try again.',
      'ORDER_CHANGED',
      409
    );
  }

  let ticketResult: OrderCreatedResult | null = null;
  let ticketError: string | null = null;

  try {
    ticketResult = await recordOrderCreated(input.orderId);
  } catch (error) {
    ticketError = error instanceof Error ? error.message : 'Ticket failed';
    console.error(
      `[order-events] FAILED to record kitchen ticket for ${input.orderId}:`,
      error
    );
  }

  try {
    await recordOrderStatusChanged(input.orderId, 'PENDING', 'CONFIRMED');
  } catch (error) {
    console.error(
      `[order-events] FAILED to record status change for ${input.orderId}:`,
      error
    );
  }

  await prisma.auditLog.create({
    data: {
      tableName: 'orders',
      recordId: input.orderId,
      operation: 'UPDATE',
      oldValues: { status: 'PENDING' },
      newValues: {
        status: 'CONFIRMED',
        ...(stationOverride ? { stationOverride: true } : {}),
      },
      changedBy: input.actor.userId,
      changedByType: input.actor.userType,
      ipAddress: input.ipAddress || 'unknown',
    },
  });

  await PostgresEventManager.publishOrderStatusChange({
    orderId: input.orderId,
    oldStatus: 'PENDING',
    newStatus: 'CONFIRMED',
    restaurantId: currentOrder.restaurantId,
    tableId: currentOrder.tableId,
    orderNumber: currentOrder.orderNumber,
    timestamp: Date.now(),
    changedBy: input.actor.userId,
  });

  await PostgresEventManager.publishKitchenNotification({
    type: 'new_order',
    orderId: input.orderId,
    restaurantId: currentOrder.restaurantId,
    message: `New order ${currentOrder.orderNumber} ready for kitchen`,
    timestamp: Date.now(),
  });

  try {
    if (currentOrder.tableId) {
      await autoUpdateTableStatus(currentOrder.tableId);
    }
  } catch (error) {
    console.error(
      `[OrderDispatch] Failed to auto-update table status for ${currentOrder.tableId}:`,
      error
    );
  }

  return {
    order: updatedOrder as ConfirmedOrder,
    ticket: {
      routed: (ticketResult?.tickets ?? 0) > 0,
      stationIds: ticketResult?.stationIds ?? [],
      unroutedItemIds: ticketResult?.unroutedItemIds ?? [],
      replayed: ticketResult?.replayed ?? false,
      error: ticketError,
      ticketStatus: (ticketResult?.tickets ?? 0) > 0 ? 'QUEUED' : 'NOT_ROUTED',
    },
    replayed: false,
  };
}
