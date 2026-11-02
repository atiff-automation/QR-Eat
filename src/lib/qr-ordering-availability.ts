/**
 * QR ordering availability.
 *
 * Two independent gates:
 *  1. an owner/manager manual pause stored on the restaurant;
 *  2. an automatic pause when no Counter session has been active recently.
 *
 * The automatic gate exists because a customer on mobile data can still reach
 * the server while the restaurant's own internet is down. Accepting that order
 * would create a PENDING order that no Counter or Station can receive.
 *
 * A Counter session is the presence signal: the Counter polls while signed in,
 * and every authenticated request refreshes `UserSession.lastActivity`.
 * A remote web tab is deliberately not counted.
 */

import { prisma } from '@/lib/database';

/** Three minutes is roughly two missed Counter polls (10s each) plus slack. */
export const QR_ORDERING_COUNTER_WINDOW_MS = 3 * 60_000;

export type QrOrderingReason =
  | 'AVAILABLE'
  | 'MANUAL_PAUSE'
  | 'COUNTER_OFFLINE'
  | 'RESTAURANT_CLOSED';

export interface QrOrderingAvailability {
  available: boolean;
  reason: QrOrderingReason;
  message: string | null;
  lastCounterActivityAt: Date | null;
}

const MANUAL_PAUSE_MESSAGE =
  'Online ordering is temporarily paused. Please order at the counter.';

const COUNTER_OFFLINE_MESSAGE =
  'Online ordering is temporarily unavailable. Please order at the counter.';

const CLOSED_MESSAGE = 'Restaurant is currently closed.';

/**
 * Resolve whether QR ordering is currently accepting orders for a restaurant.
 *
 * `now` is injectable so the presence window can be tested without sleeping.
 */
export async function getQrOrderingAvailability(
  restaurantId: string,
  now: Date = new Date()
): Promise<QrOrderingAvailability> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      isActive: true,
      qrOrderingPaused: true,
    },
  });

  if (!restaurant || !restaurant.isActive) {
    return {
      available: false,
      reason: 'RESTAURANT_CLOSED',
      message: CLOSED_MESSAGE,
      lastCounterActivityAt: null,
    };
  }

  if (restaurant.qrOrderingPaused) {
    return {
      available: false,
      reason: 'MANUAL_PAUSE',
      message: MANUAL_PAUSE_MESSAGE,
      lastCounterActivityAt: null,
    };
  }

  const oldestAllowed = new Date(now.getTime() - QR_ORDERING_COUNTER_WINDOW_MS);

  const counterSession = await prisma.userSession.findFirst({
    where: {
      restaurantContextId: restaurantId,
      deviceType: 'counter',
      expiresAt: { gt: now },
      lastActivity: { gte: oldestAllowed },
    },
    orderBy: { lastActivity: 'desc' },
    select: { lastActivity: true },
  });

  if (!counterSession) {
    return {
      available: false,
      reason: 'COUNTER_OFFLINE',
      message: COUNTER_OFFLINE_MESSAGE,
      lastCounterActivityAt: null,
    };
  }

  return {
    available: true,
    reason: 'AVAILABLE',
    message: null,
    lastCounterActivityAt: counterSession.lastActivity,
  };
}
