/**
 * POST /api/orders/[id]/recall
 *
 * Returns a READY ticket to the kitchen at one station. The order status stays
 * READY: payment, reporting and the customer-visible lifecycle must not move
 * backwards. The station gets a recall row, its items go back to PREPARING and
 * an `order.recalled` event is appended. Re-bumping the last item clears it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { resolveKitchenActor, type KitchenActor } from '@/lib/kitchen-actor';
import {
  getRecallWindowMinutes,
  isRecallEnabled,
  isRecallWindowExpired,
  RECALL_REASON_MAX_LENGTH,
  resolveOrderStationIds,
  stationItemIds,
} from '@/lib/recall';
import { recordOrderRecalled } from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(
  error: string,
  code: string,
  status: number
): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isRecallEnabled()) {
      return errorResponse(
        'Kitchen recall is not enabled',
        'RECALL_DISABLED',
        404
      );
    }

    const actor: KitchenActor | null = await resolveKitchenActor(request);
    if (!actor) {
      return errorResponse(
        'Kitchen or manager access required',
        'RECALL_NOT_ALLOWED',
        403
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      expectedVersion?: unknown;
      stationId?: unknown;
      reason?: unknown;
    };

    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      return errorResponse(
        'expectedVersion is required',
        'INVALID_VERSION',
        400
      );
    }

    const requestedStation =
      typeof body.stationId === 'string' && body.stationId.length > 0
        ? body.stationId
        : undefined;
    const reason =
      typeof body.reason === 'string'
        ? body.reason.trim().slice(0, RECALL_REASON_MAX_LENGTH)
        : null;
    const idempotencyKey =
      request.headers.get('idempotency-key')?.trim() || null;

    const { id: orderId } = await params;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        restaurantId: true,
        orderNumber: true,
        status: true,
        readyAt: true,
        version: true,
      },
    });

    if (!order) {
      return errorResponse('Order not found', 'NOT_FOUND', 404);
    }
    if (order.restaurantId !== actor.restaurantId) {
      return errorResponse('Order not found', 'NOT_FOUND', 404);
    }

    if (order.status !== 'READY') {
      return errorResponse(
        order.status === 'SERVED' || order.status === 'CANCELLED'
          ? 'This order can no longer be recalled; create a remake'
          : 'Only a ready order can be recalled',
        order.status === 'SERVED' || order.status === 'CANCELLED'
          ? 'ORDER_NOT_RECALLABLE'
          : 'ORDER_NOT_READY',
        409
      );
    }

    if (!order.readyAt) {
      return errorResponse(
        'This order has no ready time; recall is unavailable',
        'ORDER_NOT_RECALLABLE',
        409
      );
    }

    if (isRecallWindowExpired(order.readyAt)) {
      return errorResponse(
        `The ${getRecallWindowMinutes()}-minute recall window has expired`,
        'RECALL_WINDOW_EXPIRED',
        409
      );
    }

    const stationIds = await resolveOrderStationIds(
      order.id,
      order.restaurantId
    );
    if (stationIds.length === 0) {
      return errorResponse(
        'This order has no station ticket',
        'STATION_NOT_FOUND',
        409
      );
    }

    let stationId = requestedStation ?? actor.deviceStationId;
    if (actor.deviceStationId) {
      if (stationId && stationId !== actor.deviceStationId) {
        return errorResponse(
          'Kitchen staff can only recall their own station',
          'RECALL_NOT_ALLOWED',
          403
        );
      }
      stationId = actor.deviceStationId;
    }

    if (!stationId) {
      if (stationIds.length !== 1) {
        return errorResponse(
          'stationId is required for a multi-station order',
          'STATION_REQUIRED',
          400
        );
      }
      stationId = stationIds[0];
    }

    if (!stationIds.includes(stationId)) {
      return errorResponse(
        'This station has no items on the order',
        'STATION_NOT_IN_ORDER',
        409
      );
    }

    const existing = await prisma.stationOrderRecall.findUnique({
      where: { orderId_stationId: { orderId, stationId } },
    });

    if (existing && !existing.resolvedAt) {
      if (idempotencyKey && existing.idempotencyKey === idempotencyKey) {
        return NextResponse.json({
          success: true,
          replayed: true,
          recall: existing,
          order: {
            id: order.id,
            status: order.status,
            version: order.version,
          },
        });
      }
      return errorResponse(
        'This ticket is already recalled',
        'RECALL_ALREADY_ACTIVE',
        409
      );
    }

    const itemIds = await stationItemIds(
      order.id,
      order.restaurantId,
      stationId
    );
    if (itemIds.length === 0) {
      return errorResponse(
        'This station has no items on the order',
        'STATION_NOT_IN_ORDER',
        409
      );
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          restaurantId: actor.restaurantId,
          status: 'READY',
          version: expectedVersion,
        },
        data: { version: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new Error('VERSION_CONFLICT');
      }

      await tx.orderItem.updateMany({
        where: { orderId: order.id, id: { in: itemIds } },
        data: { status: 'PREPARING', updatedAt: now },
      });

      const recall = await tx.stationOrderRecall.upsert({
        where: { orderId_stationId: { orderId, stationId } },
        create: {
          restaurantId: order.restaurantId,
          stationId,
          orderId,
          recalledAt: now,
          recalledBy: actor.actorId ?? null,
          reason,
          idempotencyKey,
        },
        update: {
          recalledAt: now,
          recalledBy: actor.actorId ?? null,
          reason,
          idempotencyKey,
          resolvedAt: null,
        },
      });

      const fresh = await tx.order.findUnique({
        where: { id: order.id },
        select: { id: true, status: true, version: true },
      });

      return { recall, order: fresh };
    });

    try {
      await recordOrderRecalled(order.id, stationId, now, reason);
    } catch (eventError) {
      console.error(
        `[recall] FAILED to record recall event for ${order.id}:`,
        eventError
      );
    }

    await PostgresEventManager.publishOrderRecalled({
      orderId: order.id,
      orderNumber: order.orderNumber,
      restaurantId: order.restaurantId,
      stationId,
      recalledAt: now.toISOString(),
      reason,
      version: result.order?.version ?? expectedVersion + 1,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      recall: result.recall,
      order: result.order,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
      return errorResponse(
        'The order changed while you were recalling it',
        'VERSION_CONFLICT',
        409
      );
    }
    console.error('[recall] failed:', error);
    return errorResponse('Failed to recall order', 'INTERNAL_ERROR', 500);
  }
}
