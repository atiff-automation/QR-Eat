/**
 * POST /api/orders/[id]/ready
 *
 * One atomic kitchen intent: mark every item routed to the station READY,
 * advance the order when the whole order is ready, and clear an active recall.
 * The client no longer loops item PATCHes, so a transport failure cannot leave
 * a ticket half-finished.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { resolveKitchenActor } from '@/lib/kitchen-actor';
import {
  clearRecallIfStationReady,
  resolveOrderStationIds,
  stationItemIds,
} from '@/lib/recall';
import {
  recordOrderItemStatusChanged,
  recordOrderRecallCleared,
  recordOrderStatusChanged,
} from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import {
  findReceipt,
  idempotencyKeyFrom,
  ORDER_ACTION,
  saveReceipt,
} from '@/lib/order-idempotency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function error(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await resolveKitchenActor(request);
    if (!actor) {
      return error(
        'Kitchen or manager access required',
        'KITCHEN_NOT_ALLOWED',
        403
      );
    }

    const idempotencyKey = idempotencyKeyFrom(request);
    if (!idempotencyKey) {
      return error(
        'Idempotency-Key header is required',
        'IDEMPOTENCY_KEY_REQUIRED',
        400
      );
    }

    const replay = await findReceipt(
      actor.restaurantId,
      ORDER_ACTION.ORDER_READY,
      idempotencyKey
    );
    if (replay) {
      return NextResponse.json(replay.body, { status: replay.statusCode });
    }

    const body = (await request.json().catch(() => ({}))) as {
      expectedVersion?: unknown;
      stationId?: unknown;
    };
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      return error('expectedVersion is required', 'INVALID_VERSION', 400);
    }

    const requestedStation =
      typeof body.stationId === 'string' && body.stationId.length > 0
        ? body.stationId
        : undefined;
    const { id: orderId } = await params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        restaurantId: true,
        orderNumber: true,
        status: true,
        version: true,
        readyAt: true,
        tableId: true,
      },
    });
    if (!order || order.restaurantId !== actor.restaurantId) {
      return error('Order not found', 'NOT_FOUND', 404);
    }
    if (!['CONFIRMED', 'PREPARING', 'READY'].includes(order.status)) {
      return error(
        'This order is not in a kitchen-action state',
        'ORDER_NOT_READY',
        409
      );
    }

    const stationIds = await resolveOrderStationIds(
      order.id,
      order.restaurantId
    );
    if (stationIds.length === 0) {
      return error(
        'This order has no station ticket',
        'STATION_NOT_FOUND',
        409
      );
    }

    let stationId = requestedStation ?? actor.deviceStationId;
    if (actor.deviceStationId) {
      if (stationId && stationId !== actor.deviceStationId) {
        return error(
          'Kitchen staff can only act on their own station',
          'KITCHEN_NOT_ALLOWED',
          403
        );
      }
      stationId = actor.deviceStationId;
    }
    if (!stationId) {
      if (stationIds.length !== 1) {
        return error(
          'stationId is required for a multi-station order',
          'STATION_REQUIRED',
          400
        );
      }
      stationId = stationIds[0];
    }
    if (!stationIds.includes(stationId)) {
      return error(
        'This station has no items on the order',
        'STATION_NOT_IN_ORDER',
        409
      );
    }

    const itemIds = await stationItemIds(
      order.id,
      order.restaurantId,
      stationId
    );
    if (itemIds.length === 0) {
      return error(
        'This station has no items on the order',
        'STATION_NOT_IN_ORDER',
        409
      );
    }

    const beforeItems = await prisma.orderItem.findMany({
      where: { orderId: order.id, id: { in: itemIds } },
      select: { id: true, status: true },
    });
    if (beforeItems.length !== itemIds.length) {
      return error(
        'The ticket changed while it was loading',
        'TICKET_CHANGED',
        409
      );
    }

    const now = new Date();
    const transaction = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          restaurantId: actor.restaurantId,
          version: expectedVersion,
          status: { in: ['CONFIRMED', 'PREPARING', 'READY'] },
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new Error('VERSION_CONFLICT');
      }

      await tx.orderItem.updateMany({
        where: { orderId: order.id, id: { in: itemIds } },
        data: { status: 'READY', updatedAt: now },
      });

      const allItems = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { status: true },
      });
      const allReady = allItems.every((item) => item.status === 'READY');

      if (allReady && order.status !== 'READY') {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'READY',
            readyAt: order.readyAt ?? now,
            updatedAt: now,
          },
        });
      }

      const fresh = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { id: true, status: true, version: true, readyAt: true },
      });
      const items = await tx.orderItem.findMany({
        where: { orderId: order.id, id: { in: itemIds } },
        select: { id: true, status: true },
      });
      return { order: fresh, items };
    });

    // The mutation is committed. Event failures are loud but must not make the
    // operator repeat an action that already succeeded.
    for (const item of beforeItems) {
      if (item.status === 'READY') continue;
      try {
        await recordOrderItemStatusChanged(
          order.id,
          item.id,
          item.status,
          'READY',
          { staffId: actor.actorId, staffName: actor.actorName }
        );
        await PostgresEventManager.publishOrderItemStatusChange({
          orderId: order.id,
          itemId: item.id,
          restaurantId: order.restaurantId,
          oldStatus: item.status,
          newStatus: 'READY',
          timestamp: Date.now(),
        });
      } catch (eventError) {
        console.error(
          `[order-ready] FAILED item event ${item.id}:`,
          eventError
        );
      }
    }

    if (order.status !== 'READY' && transaction.order.status === 'READY') {
      try {
        await recordOrderStatusChanged(order.id, order.status, 'READY');
        await PostgresEventManager.publishOrderStatusChange({
          orderId: order.id,
          oldStatus: order.status,
          newStatus: 'READY',
          restaurantId: order.restaurantId,
          tableId: order.tableId,
          orderNumber: order.orderNumber,
          timestamp: Date.now(),
        });
      } catch (eventError) {
        console.error(
          `[order-ready] FAILED status event for ${order.id}:`,
          eventError
        );
      }
    }

    const activeRecall = await prisma.stationOrderRecall.findUnique({
      where: { orderId_stationId: { orderId: order.id, stationId } },
    });
    if (activeRecall && !activeRecall.resolvedAt) {
      const cleared = await clearRecallIfStationReady(
        order.id,
        order.restaurantId,
        stationId
      );
      if (cleared) {
        try {
          await recordOrderRecallCleared(
            order.id,
            stationId,
            cleared.recalledAt,
            cleared.clearedAt,
            cleared.reason
          );
          await PostgresEventManager.publishOrderRecallCleared({
            orderId: order.id,
            orderNumber: order.orderNumber,
            restaurantId: order.restaurantId,
            stationId,
            recalledAt: cleared.recalledAt.toISOString(),
            clearedAt: cleared.clearedAt.toISOString(),
            reason: cleared.reason,
            version: transaction.order.version,
            timestamp: Date.now(),
          });
        } catch (eventError) {
          console.error(
            `[order-ready] FAILED recall clear event for ${order.id}:`,
            eventError
          );
        }
      }
    }

    const responseBody = {
      success: true,
      stationId,
      order: transaction.order,
      items: transaction.items,
    };

    try {
      await saveReceipt({
        restaurantId: actor.restaurantId,
        action: ORDER_ACTION.ORDER_READY,
        key: idempotencyKey,
        orderId: order.id,
        statusCode: 200,
        body: JSON.parse(JSON.stringify(responseBody)),
      });
    } catch (receiptError) {
      console.error(
        `[order-ready] FAILED to save receipt for ${order.id}:`,
        receiptError
      );
    }

    return NextResponse.json(responseBody);
  } catch (caught) {
    if (caught instanceof Error && caught.message === 'VERSION_CONFLICT') {
      return error(
        'The order changed while you were marking it ready',
        'VERSION_CONFLICT',
        409
      );
    }
    console.error('[order-ready] failed:', caught);
    return error('Failed to mark order ready', 'INTERNAL_ERROR', 500);
  }
}
