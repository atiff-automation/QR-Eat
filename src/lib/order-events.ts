/**
 * Station event log.
 *
 * The server owns routing. When an order is created or changes state, this
 * module resolves every item to a station and writes one event per station,
 * with only that station's items embedded. The event is the print document:
 * a station never has to fetch the order to know what to cook (D18, D19).
 *
 * Events are appended, never updated. `id` is the resume cursor.
 */

import { prisma } from '@/lib/database';
import type { Prisma } from '@prisma/client';
import { formatPickupNumber } from '@/lib/order-utils';

export const ORDER_EVENT_TYPES = {
  CREATED: 'order.created',
  ITEMS_ADDED: 'order.items.added',
  ITEM_STATUS_CHANGED: 'order.item.status.changed',
  STATUS_CHANGED: 'order.status.changed',
  CANCELLED: 'order.cancelled',
  RECALLED: 'order.recalled',
  RECALL_CLEARED: 'order.recall.cleared',
} as const;

export interface StationOrderItem {
  itemId: string;
  name: string;
  qty: number;
  modifiers: string[];
  notes: string | null;
}

export interface OrderCreatedPayload {
  orderNumber: string;
  tableName: string;
  orderType: string;
  pickupNumber: string | null;
  customerName: string | null;
  fulfillmentLabel: string;
  orderNote: string | null;
  items: StationOrderItem[];
  stationSubtotal: string;
  /** True when at least one item had no category mapping and fell back. */
  fallback: boolean;
}

export interface OrderCreatedResult {
  tickets: number;
  stationIds: string[];
  unroutedItemIds: string[];
  replayed: boolean;
}

export interface OrderStatusPayload {
  orderNumber: string;
  tableName: string;
  orderType: string;
  pickupNumber: string | null;
  customerName: string | null;
  fulfillmentLabel: string;
  from: string;
  to: string;
  version: number;
}

export interface OrderRecallPayload {
  orderNumber: string;
  tableName: string;
  orderType: string;
  pickupNumber: string | null;
  customerName: string | null;
  fulfillmentLabel: string;
  stationId: string;
  recalledAt: string;
  reason: string | null;
  version: number;
}

export interface OrderRecallClearedPayload extends OrderRecallPayload {
  clearedAt: string;
}

export interface OrderItemsAddedPayload extends OrderCreatedPayload {
  /** The new lines only. A station prints this as an add-on ticket. */
  addedItemIds: string[];
}

export interface OrderItemStatusPayload {
  orderNumber: string;
  tableName: string;
  orderType: string;
  pickupNumber: string | null;
  customerName: string | null;
  fulfillmentLabel: string;
  itemId: string;
  itemName: string;
  from: string;
  to: string;
  version: number;
  staffId?: string;
  staffName?: string;
}

export interface ItemStatusActor {
  staffId?: string;
  staffName?: string;
}

interface Routing {
  byCategory: Map<string, string>;
  defaultStationId: string | null;
  stationIds: Set<string>;
}

function tableName(table: {
  tableNumber: string;
  tableName: string | null;
}): string {
  return table.tableName || `T${table.tableNumber}`;
}

function orderLabel(order: {
  table: { tableNumber: string; tableName: string | null } | null;
  orderType: string;
  dailySeq: number | null;
}): string {
  if (order.table) return tableName(order.table);
  if (order.orderType === 'TAKEAWAY') {
    const pickup = formatPickupNumber(order.dailySeq);
    return pickup ? `TAKEAWAY ${pickup}` : 'TAKEAWAY';
  }
  return 'NO TABLE';
}

export function orderFulfillment(order: {
  table: { tableNumber: string; tableName: string | null } | null;
  orderType: string;
  dailySeq: number | null;
  customerName: string | null;
}): {
  orderType: string;
  pickupNumber: string | null;
  customerName: string | null;
  fulfillmentLabel: string;
} {
  return {
    orderType: order.orderType,
    pickupNumber: formatPickupNumber(order.dailySeq),
    customerName: order.customerName,
    fulfillmentLabel: orderLabel(order),
  };
}

/**
 * Category -> station map plus the fallback station.
 * Only active stations participate; an inactive station stops receiving work.
 */
export async function resolveRouting(restaurantId: string): Promise<Routing> {
  const stations = await prisma.station.findMany({
    where: { restaurantId, isActive: true },
    select: { id: true, isDefault: true },
  });

  const stationIds = new Set(stations.map((station) => station.id));
  const defaultStation = stations.find((station) => station.isDefault) ?? null;

  const mappings = await prisma.stationCategory.findMany({
    where: { stationId: { in: [...stationIds] } },
    select: { categoryId: true, stationId: true },
  });

  return {
    byCategory: new Map(
      mappings.map((mapping) => [mapping.categoryId, mapping.stationId])
    ),
    defaultStationId: defaultStation?.id ?? null,
    stationIds,
  };
}

/**
 * Writes `order.created` events for every station that has items in the order.
 *
 * Idempotent: if the order already has creation events, it does nothing. That
 * matters because a retried request must not print a second ticket.
 */
export async function recordOrderCreated(
  orderId: string
): Promise<OrderCreatedResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      table: { select: { tableNumber: true, tableName: true } },
      items: {
        include: {
          menuItem: { select: { name: true, categoryId: true } },
          selectedOptions: { select: { name: true } },
        },
      },
    },
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const existingEvents = await prisma.orderEvent.findMany({
    where: { orderId, type: ORDER_EVENT_TYPES.CREATED },
    select: { stationId: true },
  });
  if (existingEvents.length > 0) {
    return {
      tickets: existingEvents.length,
      stationIds: [...new Set(existingEvents.map((event) => event.stationId))],
      unroutedItemIds: [],
      replayed: true,
    };
  }

  const routing = await resolveRouting(order.restaurantId);

  if (!routing.defaultStationId && routing.byCategory.size === 0) {
    // Nothing can be routed. Do not silently swallow it: the order exists and
    // the kitchen will not see it until a station is configured.
    console.error(
      `[order-events] no active station or category mapping for restaurant ${order.restaurantId}; order ${order.orderNumber} was not routed`
    );
    return {
      tickets: 0,
      stationIds: [],
      unroutedItemIds: order.items.map((item) => item.id),
      replayed: false,
    };
  }

  const grouped = new Map<
    string,
    { items: StationOrderItem[]; subtotal: number; fallback: boolean }
  >();

  const unroutedItemIds: string[] = [];

  for (const item of order.items) {
    const mapped = routing.byCategory.get(item.menuItem.categoryId);
    const stationId = mapped ?? routing.defaultStationId;

    if (!stationId) {
      console.error(
        `[order-events] item ${item.id} has no station and there is no default; order ${order.orderNumber} is partially unrouted`
      );
      unroutedItemIds.push(item.id);
      continue;
    }

    const entry = grouped.get(stationId) ?? {
      items: [],
      subtotal: 0,
      fallback: false,
    };

    entry.items.push({
      itemId: item.id,
      name: item.menuItem.name,
      qty: item.quantity,
      modifiers: item.selectedOptions.map((option) => option.name),
      notes: item.specialInstructions,
    });
    entry.subtotal += Number(item.totalAmount);
    entry.fallback = entry.fallback || mapped === undefined;

    grouped.set(stationId, entry);
  }

  if (grouped.size === 0) {
    return {
      tickets: 0,
      stationIds: [],
      unroutedItemIds,
      replayed: false,
    };
  }

  const rows = [...grouped.entries()].map(([stationId, entry]) => {
    const payload: OrderCreatedPayload = {
      orderNumber: order.orderNumber,
      tableName: orderLabel(order),
      ...orderFulfillment(order),
      orderNote: order.specialInstructions,
      items: entry.items,
      stationSubtotal: entry.subtotal.toFixed(2),
      fallback: entry.fallback,
    };

    return {
      restaurantId: order.restaurantId,
      stationId,
      orderId: order.id,
      type: ORDER_EVENT_TYPES.CREATED,
      payload: payload as unknown as Prisma.InputJsonValue,
      printStatus: 'PENDING' as const,
    };
  });

  await prisma.orderEvent.createMany({ data: rows });

  return {
    tickets: rows.length,
    stationIds: [...grouped.keys()],
    unroutedItemIds,
    replayed: false,
  };
}

/**
 * Writes one status event per station that already received the order.
 *
 * Routing is taken from the creation events rather than recomputed: if an
 * item was moved between stations after the ticket printed, the station that
 * printed it is the one that needs the update.
 */
export async function recordOrderStatusChanged(
  orderId: string,
  from: string,
  to: string,
  options: { reason?: string | null } = {}
): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { table: { select: { tableNumber: true, tableName: true } } },
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const stationRows = await prisma.orderEvent.findMany({
    where: { orderId },
    distinct: ['stationId'],
    select: { stationId: true },
  });

  let stationIds = stationRows.map((row) => row.stationId);

  // No creation event (for example, the order predates this log). Fall back to
  // routing so the station still learns about the change — except for a
  // PENDING cancellation: no kitchen ticket ever existed, so there is nothing
  // to stop and no slip to print (D41).
  if (stationIds.length === 0) {
    if (from === 'PENDING') {
      return 0;
    }

    const routing = await resolveRouting(order.restaurantId);
    stationIds = routing.defaultStationId ? [routing.defaultStationId] : [];
  }

  if (stationIds.length === 0) {
    return 0;
  }

  const isCancellation = to === 'CANCELLED';
  const type = isCancellation
    ? ORDER_EVENT_TYPES.CANCELLED
    : ORDER_EVENT_TYPES.STATUS_CHANGED;

  const payload: OrderStatusPayload & { reason?: string | null } = {
    orderNumber: order.orderNumber,
    tableName: orderLabel(order),
    ...orderFulfillment(order),
    from,
    to,
    version: order.version,
    ...(isCancellation ? { reason: options.reason ?? null } : {}),
  };

  await prisma.orderEvent.createMany({
    data: stationIds.map((stationId) => ({
      restaurantId: order.restaurantId,
      stationId,
      orderId: order.id,
      type,
      payload: payload as unknown as Prisma.InputJsonValue,
      printStatus: isCancellation ? ('PENDING' as const) : undefined,
    })),
  });

  return stationIds.length;
}

async function recallPayload(
  orderId: string,
  stationId: string,
  recalledAt: Date,
  reason: string | null
): Promise<OrderRecallPayload> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { table: { select: { tableNumber: true, tableName: true } } },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  return {
    orderNumber: order.orderNumber,
    tableName: orderLabel(order),
    ...orderFulfillment(order),
    stationId,
    recalledAt: recalledAt.toISOString(),
    reason,
    version: order.version,
  };
}

/** One station event; recall never prints a new ticket. */
export async function recordOrderRecalled(
  orderId: string,
  stationId: string,
  recalledAt: Date,
  reason: string | null
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { restaurantId: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  const payload = await recallPayload(orderId, stationId, recalledAt, reason);
  await prisma.orderEvent.create({
    data: {
      restaurantId: order.restaurantId,
      stationId,
      orderId,
      type: ORDER_EVENT_TYPES.RECALLED,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

/** One station event when the last recalled item is READY again. */
export async function recordOrderRecallCleared(
  orderId: string,
  stationId: string,
  recalledAt: Date,
  clearedAt: Date,
  reason: string | null
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { restaurantId: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  const payload: OrderRecallClearedPayload = {
    ...(await recallPayload(orderId, stationId, recalledAt, reason)),
    clearedAt: clearedAt.toISOString(),
  };
  await prisma.orderEvent.create({
    data: {
      restaurantId: order.restaurantId,
      stationId,
      orderId,
      type: ORDER_EVENT_TYPES.RECALL_CLEARED,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Writes `order.items.added` events for a round added to an existing order.
 *
 * Only the new lines are embedded, so a station prints an add-on ticket rather
 * than reprinting the whole order. The caller must call this once per accepted
 * add-items mutation; the event log is append-only and has no natural
 * idempotency key of its own.
 */
export async function recordOrderItemsAdded(
  orderId: string,
  itemIds: string[]
): Promise<number> {
  if (itemIds.length === 0) return 0;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      table: { select: { tableNumber: true, tableName: true } },
      items: {
        where: { id: { in: itemIds } },
        include: {
          menuItem: { select: { name: true, categoryId: true } },
          selectedOptions: { select: { name: true } },
        },
      },
    },
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const routing = await resolveRouting(order.restaurantId);
  if (!routing.defaultStationId && routing.byCategory.size === 0) {
    console.error(
      `[order-events] no active station or category mapping for restaurant ${order.restaurantId}; added items on order ${order.orderNumber} were not routed`
    );
    return 0;
  }

  const grouped = new Map<
    string,
    { items: StationOrderItem[]; subtotal: number; fallback: boolean }
  >();

  for (const item of order.items) {
    const mapped = routing.byCategory.get(item.menuItem.categoryId);
    const stationId = mapped ?? routing.defaultStationId;
    if (!stationId) continue;

    const entry = grouped.get(stationId) ?? {
      items: [],
      subtotal: 0,
      fallback: false,
    };
    entry.items.push({
      itemId: item.id,
      name: item.menuItem.name,
      qty: item.quantity,
      modifiers: item.selectedOptions.map((option) => option.name),
      notes: item.specialInstructions,
    });
    entry.subtotal += Number(item.totalAmount);
    entry.fallback = entry.fallback || mapped === undefined;
    grouped.set(stationId, entry);
  }

  if (grouped.size === 0) return 0;

  await prisma.orderEvent.createMany({
    data: [...grouped.entries()].map(([stationId, entry]) => {
      const payload: OrderItemsAddedPayload = {
        orderNumber: order.orderNumber,
        tableName: orderLabel(order),
        ...orderFulfillment(order),
        orderNote: order.specialInstructions,
        items: entry.items,
        stationSubtotal: entry.subtotal.toFixed(2),
        fallback: entry.fallback,
        addedItemIds: entry.items.map((item) => item.itemId),
      };
      return {
        restaurantId: order.restaurantId,
        stationId,
        orderId: order.id,
        type: ORDER_EVENT_TYPES.ITEMS_ADDED,
        payload: payload as unknown as Prisma.InputJsonValue,
        printStatus: 'PENDING' as const,
      };
    }),
  });

  return grouped.size;
}

/**
 * Writes `order.item.status.changed` to every station that received the order.
 * Item-level progress is what a kitchen display uses to tick a line off; it is
 * not a new ticket, so no station reprints.
 */
export async function recordOrderItemStatusChanged(
  orderId: string,
  itemId: string,
  from: string,
  to: string,
  actor?: ItemStatusActor
): Promise<number> {
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: {
      menuItem: { select: { name: true } },
      order: {
        include: {
          table: { select: { tableNumber: true, tableName: true } },
        },
      },
    },
  });

  if (!item || item.orderId !== orderId) {
    throw new Error(`Order item ${itemId} not found on order ${orderId}`);
  }

  const stationRows = await prisma.orderEvent.findMany({
    where: { orderId },
    distinct: ['stationId'],
    select: { stationId: true },
  });

  let stationIds = stationRows.map((row) => row.stationId);
  if (stationIds.length === 0) {
    const routing = await resolveRouting(item.order.restaurantId);
    stationIds = routing.defaultStationId ? [routing.defaultStationId] : [];
  }

  if (stationIds.length === 0) return 0;

  const payload: OrderItemStatusPayload = {
    orderNumber: item.order.orderNumber,
    tableName: orderLabel(item.order),
    ...orderFulfillment(item.order),
    itemId: item.id,
    itemName: item.menuItem.name,
    from,
    to,
    version: item.order.version,
    ...(actor?.staffId
      ? { staffId: actor.staffId, staffName: actor.staffName }
      : {}),
  };

  await prisma.orderEvent.createMany({
    data: stationIds.map((stationId) => ({
      restaurantId: item.order.restaurantId,
      stationId,
      orderId,
      type: ORDER_EVENT_TYPES.ITEM_STATUS_CHANGED,
      payload: payload as unknown as Prisma.InputJsonValue,
    })),
  });

  return stationIds.length;
}

/**
 * Deletes events older than the replay window. Run this on a schedule; the
 * stream itself only refuses an expired cursor (410) and never deletes.
 */
export async function cleanupOrderEvents(
  retentionDays: number = 7
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const result = await prisma.orderEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Highest seq written for a station, used as the snapshot baseline.
 */
export async function stationCursor(stationId: string): Promise<number> {
  const last = await prisma.orderEvent.findFirst({
    where: { stationId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });

  return last ? Number(last.id) : 0;
}
