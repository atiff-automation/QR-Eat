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

export const ORDER_EVENT_TYPES = {
  CREATED: 'order.created',
  STATUS_CHANGED: 'order.status.changed',
  CANCELLED: 'order.cancelled',
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
  orderNote: string | null;
  items: StationOrderItem[];
  stationSubtotal: string;
  /** True when at least one item had no category mapping and fell back. */
  fallback: boolean;
}

export interface OrderStatusPayload {
  orderNumber: string;
  tableName: string;
  from: string;
  to: string;
  version: number;
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
export async function recordOrderCreated(orderId: string): Promise<number> {
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

  const existing = await prisma.orderEvent.count({
    where: { orderId, type: ORDER_EVENT_TYPES.CREATED },
  });
  if (existing > 0) {
    return 0;
  }

  const routing = await resolveRouting(order.restaurantId);

  if (!routing.defaultStationId && routing.byCategory.size === 0) {
    // Nothing can be routed. Do not silently swallow it: the order exists and
    // the kitchen will not see it until a station is configured.
    console.error(
      `[order-events] no active station or category mapping for restaurant ${order.restaurantId}; order ${order.orderNumber} was not routed`
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

    if (!stationId) {
      console.error(
        `[order-events] item ${item.id} has no station and there is no default; order ${order.orderNumber} is partially unrouted`
      );
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
    return 0;
  }

  const rows = [...grouped.entries()].map(([stationId, entry]) => {
    const payload: OrderCreatedPayload = {
      orderNumber: order.orderNumber,
      tableName: tableName(order.table),
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
    };
  });

  await prisma.orderEvent.createMany({ data: rows });

  return rows.length;
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
  // routing so the station still learns about the change.
  if (stationIds.length === 0) {
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
    tableName: tableName(order.table),
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
    })),
  });

  return stationIds.length;
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
