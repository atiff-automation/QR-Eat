/**
 * Kitchen recall helpers.
 *
 * Recall is a station-scoped side effect, not an order-status transition. The
 * order stays READY; this module owns the window, feature flag and station/item
 * resolution so the route and the item-status gate cannot drift apart.
 */

import { prisma } from '@/lib/database';
import { ORDER_EVENT_TYPES, resolveRouting } from '@/lib/order-events';

export const RECALL_DEFAULT_WINDOW_MINUTES = 15;
export const RECALL_REASON_MAX_LENGTH = 280;

export function isRecallEnabled(): boolean {
  return process.env.RECALL_ENABLED === 'true';
}

export function getRecallWindowMinutes(): number {
  const raw = Number(process.env.RECALL_WINDOW_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) {
    return RECALL_DEFAULT_WINDOW_MINUTES;
  }
  return Math.min(Math.floor(raw), 24 * 60);
}

export function recallExpiresAt(readyAt: Date): Date {
  return new Date(readyAt.getTime() + getRecallWindowMinutes() * 60_000);
}

export function isRecallWindowExpired(
  readyAt: Date,
  now = new Date()
): boolean {
  return now.getTime() > recallExpiresAt(readyAt).getTime();
}

export function isRecallActive(recall: { resolvedAt: Date | null }): boolean {
  return recall.resolvedAt === null;
}

/**
 * Resolves the recall station from the order's own ticket history.
 *
 * Creation/add events are the routing record: if a category was remapped after
 * the ticket printed, the station that printed it still owns the lines it saw.
 * A fallback to current routing covers orders that predate the event log.
 */
export async function resolveOrderStationIds(
  orderId: string,
  restaurantId: string
): Promise<string[]> {
  const events = await prisma.orderEvent.findMany({
    where: {
      orderId,
      type: {
        in: [ORDER_EVENT_TYPES.CREATED, ORDER_EVENT_TYPES.ITEMS_ADDED],
      },
    },
    distinct: ['stationId'],
    select: { stationId: true },
  });

  if (events.length > 0) {
    return events.map((event) => event.stationId);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { menuItem: { select: { categoryId: true } } },
      },
    },
  });

  if (!order || order.restaurantId !== restaurantId) {
    return [];
  }

  const routing = await resolveRouting(restaurantId);
  const stationIds = new Set<string>();
  for (const item of order.items) {
    const stationId =
      routing.byCategory.get(item.menuItem.categoryId) ??
      routing.defaultStationId;
    if (stationId) stationIds.add(stationId);
  }
  return [...stationIds];
}

/**
 * Returns the item IDs that belong to one station on an order.
 *
 * Prefers the event payload because it is the historical routing record. The
 * current routing map is only a fallback for legacy orders.
 */
export async function stationItemIds(
  orderId: string,
  restaurantId: string,
  stationId: string
): Promise<string[]> {
  const events = await prisma.orderEvent.findMany({
    where: {
      orderId,
      stationId,
      type: {
        in: [ORDER_EVENT_TYPES.CREATED, ORDER_EVENT_TYPES.ITEMS_ADDED],
      },
    },
    select: { payload: true },
  });

  const ids = new Set<string>();
  for (const event of events) {
    const payload = event.payload as {
      items?: Array<{ itemId?: unknown }>;
    } | null;
    for (const item of payload?.items ?? []) {
      if (typeof item.itemId === 'string') ids.add(item.itemId);
    }
  }

  if (ids.size > 0) return [...ids];

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { menuItem: { select: { categoryId: true } } },
      },
    },
  });
  if (!order || order.restaurantId !== restaurantId) return [];

  const routing = await resolveRouting(restaurantId);
  return order.items
    .filter((item) => {
      const routed =
        routing.byCategory.get(item.menuItem.categoryId) ??
        routing.defaultStationId;
      return routed === stationId;
    })
    .map((item) => item.id);
}

export async function hasActiveRecallForItem(
  orderId: string,
  itemId: string
): Promise<boolean> {
  const recalls = await prisma.stationOrderRecall.findMany({
    where: { orderId, resolvedAt: null },
    select: { restaurantId: true, stationId: true },
  });

  for (const recall of recalls) {
    const ids = await stationItemIds(
      orderId,
      recall.restaurantId,
      recall.stationId
    );
    if (ids.includes(itemId)) return true;
  }
  return false;
}

/**
 * Clears an active recall once every item routed to the station is READY.
 * Returns the cleared recall, or null when it is not clearable yet.
 */
export async function clearRecallIfStationReady(
  orderId: string,
  restaurantId: string,
  stationId: string
): Promise<{
  id: string;
  recalledAt: Date;
  reason: string | null;
  clearedAt: Date;
} | null> {
  const recall = await prisma.stationOrderRecall.findUnique({
    where: { orderId_stationId: { orderId, stationId } },
  });
  if (!recall || recall.resolvedAt) return null;

  const ids = await stationItemIds(orderId, restaurantId, stationId);
  if (ids.length === 0) return null;

  const items = await prisma.orderItem.findMany({
    where: { orderId, id: { in: ids } },
    select: { status: true },
  });
  if (
    items.length !== ids.length ||
    !items.every((item) => item.status === 'READY')
  ) {
    return null;
  }

  const clearedAt = new Date();
  const updated = await prisma.stationOrderRecall.updateMany({
    where: { id: recall.id, resolvedAt: null },
    data: { resolvedAt: clearedAt },
  });
  if (updated.count === 0) return null;
  return {
    id: recall.id,
    recalledAt: recall.recalledAt,
    reason: recall.reason,
    clearedAt,
  };
}
