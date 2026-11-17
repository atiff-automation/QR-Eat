import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import {
  PRINTABLE_EVENT_TYPES,
  resolveItemRoute,
  resolveRouting,
  recordOrderCreated,
  recordOrderStatusChanged,
  type OrderCreatedResult,
} from '@/lib/order-events';
import { aggregateTicketStatus } from '@/lib/counter/ticket-status';
import { COUNTER_STATION_ONLINE_WINDOW_MS } from '@/lib/counter/constants';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { recordRestaurantChange } from '@/lib/restaurant-changes';
import { type PrintMode } from '@/lib/station-settings';
import { resolveEffectivePrintMode } from '@/lib/print/print-ack-service';

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
  offlineDelivered?: boolean;
  paperChitPrinted?: boolean;
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

export interface RoutedStation {
  stationId: string;
  printMode: PrintMode;
}

export interface OrderPrintAuthority {
  /** Unique routed station ids, in first-seen order. */
  routedStationIds: string[];
  /** Summary authority; null when the order routes to no station. */
  printAuthority: PrintMode | null;
  /** True when any routed station (or stamped ticket) is `STATION`. */
  hasStationTicket: boolean;
  /** True when every routed station is `COUNTER`/`NONE` (guard skipped). */
  noKitchenDevice: boolean;
  /** Whether the modes came from stamped events or live routing. */
  resolvedFrom: 'events' | 'routing';
}

function summarizeAuthority(
  routedStationIds: string[],
  modes: PrintMode[],
  resolvedFrom: 'events' | 'routing'
): OrderPrintAuthority {
  const hasStationTicket = modes.includes('STATION');
  return {
    routedStationIds,
    printAuthority:
      routedStationIds.length === 0
        ? null
        : hasStationTicket
          ? 'STATION'
          : modes.includes('COUNTER')
            ? 'COUNTER'
            : 'NONE',
    hasStationTicket,
    noKitchenDevice: routedStationIds.length > 0 && !hasStationTicket,
    resolvedFrom,
  };
}

/**
 * Resolve the order's routed stations using the same category-mapping/default
 * rule as `recordOrderCreated()`, with each station's current `printMode`.
 */
export async function resolveRoutedStationModes(input: {
  restaurantId: string;
  items: Array<{ menuItem: { categoryId: string } }>;
}): Promise<RoutedStation[]> {
  if (input.items.length === 0) return [];

  const routing = await resolveRouting(input.restaurantId);
  const stationIds: string[] = [];

  for (const item of input.items) {
    const { stationId } = resolveItemRoute(routing, item.menuItem.categoryId);
    if (stationId && !stationIds.includes(stationId)) {
      stationIds.push(stationId);
    }
  }

  return stationIds.map((stationId) => ({
    stationId,
    printMode: routing.printModes.get(stationId) ?? 'STATION',
  }));
}

/**
 * Resolve the print authority for an existing order (§9.1).
 *
 * Once printable events exist, each event's stamped mode is authoritative; a
 * later station setting change must not move a ticket. A PENDING order has no
 * events yet, so routing plus the current station settings is used, exactly as
 * the confirmation guard does.
 */
export async function resolveOrderPrintAuthority(
  orderId: string,
  restaurantId: string
): Promise<OrderPrintAuthority> {
  const events = await prisma.orderEvent.findMany({
    where: { orderId, type: { in: [...PRINTABLE_EVENT_TYPES] } },
    select: { stationId: true, payload: true },
    orderBy: { id: 'asc' },
  });

  if (events.length > 0) {
    const stationIds: string[] = [];
    for (const event of events) {
      if (!stationIds.includes(event.stationId))
        stationIds.push(event.stationId);
    }

    const stations = await prisma.station.findMany({
      where: { id: { in: stationIds } },
      select: { id: true, settings: true },
    });
    const settingsById = new Map(
      stations.map((station) => [station.id, station.settings])
    );

    const modesByStation = new Map<string, PrintMode[]>();
    for (const event of events) {
      // Legacy events without a stamped mode fall back to the live setting.
      const mode = resolveEffectivePrintMode(
        event.payload,
        settingsById.get(event.stationId)
      );
      const list = modesByStation.get(event.stationId) ?? [];
      list.push(mode);
      modesByStation.set(event.stationId, list);
    }

    const modes = stationIds.map((stationId) => {
      const list = modesByStation.get(stationId) ?? [];
      if (list.includes('STATION')) return 'STATION' as const;
      if (list.includes('COUNTER')) return 'COUNTER' as const;
      return 'NONE' as const;
    });

    return summarizeAuthority(stationIds, modes, 'events');
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      items: { select: { menuItem: { select: { categoryId: true } } } },
    },
  });

  const routed = await resolveRoutedStationModes({
    restaurantId,
    items: order?.items ?? [],
  });

  return summarizeAuthority(
    routed.map((station) => station.stationId),
    routed.map((station) => station.printMode),
    'routing'
  );
}

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
    include: {
      restaurant: { select: { id: true } },
      items: {
        select: { menuItem: { select: { categoryId: true } } },
      },
    },
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
  const offlineDelivered = input.offlineDelivered === true;

  // Resolve routed stations once: the guard and its audit need the same view.
  const routedStations = await resolveRoutedStationModes({
    restaurantId: currentOrder.restaurantId,
    items: currentOrder.items,
  });
  const printAuthority = summarizeAuthority(
    routedStations.map((station) => station.stationId),
    routedStations.map((station) => station.printMode),
    'routing'
  );
  // An unrouted order keeps the existing any-online-device guard: it is a
  // configuration warning, not a no-Kitchen success (§9.2 step 4).
  const requiresKitchenDevice =
    printAuthority.routedStationIds.length === 0 ||
    printAuthority.hasStationTicket;

  if (!stationOverride && !offlineDelivered && requiresKitchenDevice) {
    const onlineWindow = new Date(
      Date.now() - COUNTER_STATION_ONLINE_WINDOW_MS
    );
    const stationIdsWithTickets = routedStations
      .filter((station) => station.printMode === 'STATION')
      .map((station) => station.stationId);

    const onlineDevice = await prisma.device.findFirst({
      where: {
        restaurantId: currentOrder.restaurantId,
        isActive: true,
        station: { isActive: true },
        ...(printAuthority.hasStationTicket
          ? { stationId: { in: stationIdsWithTickets } }
          : {}),
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
    ticketResult = await recordOrderCreated(input.orderId, {
      paperChitPrinted: input.paperChitPrinted === true,
    });
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
      restaurantId: currentOrder.restaurantId,
      category: 'orders',
      description: 'order.status',
      oldValues: { status: 'PENDING' },
      newValues: {
        status: 'CONFIRMED',
        printAuthority: printAuthority.printAuthority,
        routedStationIds: printAuthority.routedStationIds,
        noKitchenDevice: printAuthority.noKitchenDevice,
        ...(stationOverride ? { stationOverride: true } : {}),
        ...(offlineDelivered ? { offlineDelivered: true } : {}),
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
    message: `New order ${currentOrder.orderNumber} sent to kitchen`,
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

  await recordRestaurantChange({
    restaurantId: currentOrder.restaurantId,
    entityType: 'order',
    entityId: input.orderId,
  });

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
