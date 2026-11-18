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
import {
  normalizeStationSettings,
  type PrintMode,
} from '@/lib/station-settings';

export const ORDER_EVENT_TYPES = {
  CREATED: 'order.created',
  ITEMS_ADDED: 'order.items.added',
  ITEM_STATUS_CHANGED: 'order.item.status.changed',
  STATUS_CHANGED: 'order.status.changed',
  CANCELLED: 'order.cancelled',
  RECALLED: 'order.recalled',
  RECALL_CLEARED: 'order.recall.cleared',
} as const;

/** Event types that carry a printable ticket (`phase-b-print-v1` §6.3). */
export const PRINTABLE_EVENT_TYPES = [
  ORDER_EVENT_TYPES.CREATED,
  ORDER_EVENT_TYPES.ITEMS_ADDED,
  ORDER_EVENT_TYPES.CANCELLED,
] as const;

/** Server-authored skip reason for a station that is KDS only. */
export const NONE_PRINT_ERROR = 'KDS only — not printed';

export function isPrintableEventType(type: string): boolean {
  return (PRINTABLE_EVENT_TYPES as readonly string[]).includes(type);
}

export interface StationOrderItem {
  itemId: string;
  name: string;
  qty: number;
  modifiers: string[];
  notes: string | null;
}

export interface OrderCreatedPayload {
  orderNumber: string;
  /**
   * Stable Counter reference for an offline-created order. Null/absent for an
   * order created online. A station uses this as the primary display number
   * even when the LAN ticket was missed.
   */
  counterReference?: string | null;
  dailySeq?: number | null;
  clientOrderId?: string | null;
  paperChitPrinted?: boolean;
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
  /**
   * Effective print authority stamped at creation time. A later station
   * `printMode` change does not move this ticket (§4.3).
   */
  printMode: PrintMode;
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

/** Decimal-string totals captured at cancellation, for the chit. */
export interface CancelledTotals {
  subtotal: string;
  taxAmount: string;
  serviceCharge: string;
  discountAmount: string;
  totalAmount: string;
}

/** A cancellation chit is printable, so it carries the stamped mode (§5.1). */
export interface OrderCancelledPayload extends OrderStatusPayload {
  reason?: string | null;
  printMode: PrintMode;
  cancelledTotals?: CancelledTotals;
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
  actorType?: 'web' | 'station';
  actorId?: string;
  actorName?: string;
  deviceId?: string;
}

export interface OrderRecallClearedPayload extends OrderRecallPayload {
  clearedAt: string;
}

export interface OrderItemsAddedPayload extends OrderCreatedPayload {
  /** The new lines only. A station prints this as an add-on ticket. */
  addedItemIds: string[];
  /** The order version after the add-items mutation. */
  orderVersion: number;
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
  actorType?: 'web' | 'station';
  actorId?: string;
  actorName?: string;
  deviceId?: string;
}

export interface ItemStatusActor {
  actorType?: 'web' | 'station';
  actorId?: string;
  actorName?: string;
  deviceId?: string;
}

interface Routing {
  byCategory: Map<string, string>;
  defaultStationId: string | null;
  stationIds: Set<string>;
  /** Effective print mode per active station, normalized on read. */
  printModes: Map<string, PrintMode>;
}

/**
 * Resolve one item's station with the routing rule shared by the event writer
 * and the confirmation/status authority resolver: category mapping first, then
 * the default station. `mapped` is false when the category fell back.
 */
export function resolveItemRoute(
  routing: {
    byCategory: Map<string, string>;
    defaultStationId: string | null;
  },
  categoryId: string
): { stationId: string | null; mapped: boolean } {
  const mappedStationId = routing.byCategory.get(categoryId);
  return {
    stationId: mappedStationId ?? routing.defaultStationId,
    mapped: mappedStationId !== undefined,
  };
}

/**
 * Initial `printStatus` for a newly written printable ticket (§5.1).
 *
 * `NONE` is `SKIPPED` at creation so it never renders as a phantom queued
 * ticket. A `COUNTER` cancellation chit starts `SKIPPED` until B3 decides
 * whether Counter cancellation chits auto-print (O-3).
 */
export function initialPrintState(
  printMode: PrintMode,
  eventType: (typeof PRINTABLE_EVENT_TYPES)[number]
): {
  printStatus: 'PENDING' | 'SKIPPED';
  printError?: string;
} {
  if (printMode === 'NONE') {
    return { printStatus: 'SKIPPED', printError: NONE_PRINT_ERROR };
  }
  if (printMode === 'COUNTER' && eventType === ORDER_EVENT_TYPES.CANCELLED) {
    return { printStatus: 'SKIPPED' };
  }
  return { printStatus: 'PENDING' };
}

/** Resolve the effective mode for a set of station ids (missing defaults to STATION). */
async function stationPrintModes(
  stationIds: string[],
  db: Prisma.TransactionClient = prisma
): Promise<Map<string, PrintMode>> {
  const unique = [...new Set(stationIds)];
  if (unique.length === 0) return new Map();

  const stations = await db.station.findMany({
    where: { id: { in: unique } },
    select: { id: true, settings: true },
  });

  return new Map(
    stations.map((station) => [
      station.id,
      normalizeStationSettings(station.settings).printMode,
    ])
  );
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
export async function resolveRouting(
  restaurantId: string,
  db: Prisma.TransactionClient = prisma
): Promise<Routing> {
  const stations = await db.station.findMany({
    where: { restaurantId, isActive: true },
    select: { id: true, isDefault: true, settings: true },
  });

  const stationIds = new Set(stations.map((station) => station.id));
  const defaultStation = stations.find((station) => station.isDefault) ?? null;

  const mappings = await db.stationCategory.findMany({
    where: { stationId: { in: [...stationIds] } },
    select: { categoryId: true, stationId: true },
  });

  return {
    byCategory: new Map(
      mappings.map((mapping) => [mapping.categoryId, mapping.stationId])
    ),
    defaultStationId: defaultStation?.id ?? null,
    stationIds,
    printModes: new Map(
      stations.map((station) => [
        station.id,
        normalizeStationSettings(station.settings).printMode,
      ])
    ),
  };
}

/**
 * Writes `order.created` events for every station that has items in the order.
 *
 * Idempotent: if the order already has creation events, it does nothing. That
 * matters because a retried request must not print a second ticket.
 */
export async function recordOrderCreated(
  orderId: string,
  options: { paperChitPrinted?: boolean } = {}
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
    const { stationId, mapped } = resolveItemRoute(
      routing,
      item.menuItem.categoryId
    );

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
    entry.fallback = entry.fallback || !mapped;

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
    const printMode = routing.printModes.get(stationId) ?? ('STATION' as const);
    const initial = initialPrintState(printMode, ORDER_EVENT_TYPES.CREATED);
    const payload: OrderCreatedPayload = {
      orderNumber: order.orderNumber,
      counterReference: order.counterReference ?? null,
      dailySeq: order.dailySeq,
      clientOrderId: order.clientOrderId,
      paperChitPrinted: options.paperChitPrinted === true,
      tableName: orderLabel(order),
      ...orderFulfillment(order),
      orderNote: order.specialInstructions,
      items: entry.items,
      stationSubtotal: entry.subtotal.toFixed(2),
      fallback: entry.fallback,
      printMode,
    };

    return {
      restaurantId: order.restaurantId,
      stationId,
      orderId: order.id,
      type: ORDER_EVENT_TYPES.CREATED,
      payload: payload as unknown as Prisma.InputJsonValue,
      ...initial,
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
  options: {
    reason?: string | null;
    cancelledTotals?: CancelledTotals;
    tx?: Prisma.TransactionClient;
  } = {}
): Promise<number> {
  const db = options.tx ?? prisma;
  const isCancellation = to === 'CANCELLED';

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { table: { select: { tableNumber: true, tableName: true } } },
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // A cancellation chit goes only to a station that already received a
  // printable ticket. A PENDING order with no ticket has nothing to stop, and
  // B3 does not invent a fallback station for a cancellation.
  const stationRows = await db.orderEvent.findMany({
    where: {
      orderId,
      ...(isCancellation ? { type: { in: [...PRINTABLE_EVENT_TYPES] } } : {}),
    },
    distinct: ['stationId'],
    select: { stationId: true },
  });

  let stationIds = stationRows.map((row) => row.stationId);

  // A non-cancellation status update may still use routing when the order
  // predates the event log. A PENDING status change has no kitchen ticket, so
  // there is nothing to notify (D41).
  if (stationIds.length === 0) {
    if (isCancellation || from === 'PENDING') {
      return 0;
    }

    const routing = await resolveRouting(order.restaurantId, db);
    stationIds = routing.defaultStationId ? [routing.defaultStationId] : [];
  }

  if (stationIds.length === 0) {
    return 0;
  }

  const type = isCancellation
    ? ORDER_EVENT_TYPES.CANCELLED
    : ORDER_EVENT_TYPES.STATUS_CHANGED;

  const basePayload: OrderStatusPayload = {
    orderNumber: order.orderNumber,
    tableName: orderLabel(order),
    ...orderFulfillment(order),
    from,
    to,
    version: order.version,
  };

  // A cancellation chit is a new printable ticket, so it uses the station's
  // current mode and stamps it (§4.3, §5.1). Non-ticket events stay unstamped
  // and keep `printStatus=null`.
  const printModes = isCancellation
    ? await stationPrintModes(stationIds, db)
    : new Map<string, PrintMode>();

  await db.orderEvent.createMany({
    data: stationIds.map((stationId) => {
      if (!isCancellation) {
        return {
          restaurantId: order.restaurantId,
          stationId,
          orderId: order.id,
          type,
          payload: basePayload as unknown as Prisma.InputJsonValue,
        };
      }

      const printMode = printModes.get(stationId) ?? ('STATION' as const);
      const payload: OrderCancelledPayload = {
        ...basePayload,
        reason: options.reason ?? null,
        printMode,
        ...(options.cancelledTotals
          ? { cancelledTotals: options.cancelledTotals }
          : {}),
      };

      return {
        restaurantId: order.restaurantId,
        stationId,
        orderId: order.id,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
        ...initialPrintState(printMode, ORDER_EVENT_TYPES.CANCELLED),
      };
    }),
  });

  return stationIds.length;
}

async function recallPayload(
  orderId: string,
  stationId: string,
  recalledAt: Date,
  reason: string | null,
  actor?: ItemStatusActor
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
    ...(actor?.actorType ? { actorType: actor.actorType } : {}),
    ...(actor?.actorId ? { actorId: actor.actorId } : {}),
    ...(actor?.actorName ? { actorName: actor.actorName } : {}),
    ...(actor?.deviceId ? { deviceId: actor.deviceId } : {}),
  };
}

/** One station event; recall never prints a new ticket. */
export async function recordOrderRecalled(
  orderId: string,
  stationId: string,
  recalledAt: Date,
  reason: string | null,
  actor?: ItemStatusActor
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { restaurantId: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  const payload = await recallPayload(
    orderId,
    stationId,
    recalledAt,
    reason,
    actor
  );
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
  reason: string | null,
  actor?: ItemStatusActor
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { restaurantId: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  const payload: OrderRecallClearedPayload = {
    ...(await recallPayload(orderId, stationId, recalledAt, reason, actor)),
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
 * add-items mutation; the event log is append-only.
 *
 * B3-S wires the producer: `POST /api/orders/{orderId}/items` calls this inside
 * the add-items transaction, after its scoped idempotency receipt has ruled out
 * a replay. Do not add a second caller that is not guarded by that receipt.
 */
export async function recordOrderItemsAdded(
  orderId: string,
  itemIds: string[],
  options: { tx?: Prisma.TransactionClient } = {}
): Promise<OrderCreatedResult> {
  if (itemIds.length === 0) {
    return { tickets: 0, stationIds: [], unroutedItemIds: [], replayed: false };
  }

  const db = options.tx ?? prisma;
  const order = await db.order.findUnique({
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

  const routing = await resolveRouting(order.restaurantId, db);
  if (!routing.defaultStationId && routing.byCategory.size === 0) {
    console.error(
      `[order-events] no active station or category mapping for restaurant ${order.restaurantId}; added items on order ${order.orderNumber} were not routed`
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

  for (const item of order.items) {
    const { stationId, mapped } = resolveItemRoute(
      routing,
      item.menuItem.categoryId
    );
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
    entry.fallback = entry.fallback || !mapped;
    grouped.set(stationId, entry);
  }

  if (grouped.size === 0) {
    return { tickets: 0, stationIds: [], unroutedItemIds: [], replayed: false };
  }

  await db.orderEvent.createMany({
    data: [...grouped.entries()].map(([stationId, entry]) => {
      const printMode =
        routing.printModes.get(stationId) ?? ('STATION' as const);
      const payload: OrderItemsAddedPayload = {
        orderNumber: order.orderNumber,
        counterReference: order.counterReference ?? null,
        dailySeq: order.dailySeq,
        tableName: orderLabel(order),
        ...orderFulfillment(order),
        orderNote: order.specialInstructions,
        items: entry.items,
        stationSubtotal: entry.subtotal.toFixed(2),
        fallback: entry.fallback,
        addedItemIds: entry.items.map((item) => item.itemId),
        orderVersion: order.version,
        printMode,
      };
      return {
        restaurantId: order.restaurantId,
        stationId,
        orderId: order.id,
        type: ORDER_EVENT_TYPES.ITEMS_ADDED,
        payload: payload as unknown as Prisma.InputJsonValue,
        ...initialPrintState(printMode, ORDER_EVENT_TYPES.ITEMS_ADDED),
      };
    }),
  });

  return {
    tickets: grouped.size,
    stationIds: [...grouped.keys()],
    unroutedItemIds: [],
    replayed: false,
  };
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
    ...(actor?.actorType ? { actorType: actor.actorType } : {}),
    ...(actor?.actorId ? { actorId: actor.actorId } : {}),
    ...(actor?.actorName ? { actorName: actor.actorName } : {}),
    ...(actor?.deviceId ? { deviceId: actor.deviceId } : {}),
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
