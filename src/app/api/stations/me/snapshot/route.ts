/**
 * Cold-start snapshot for a station.
 *
 * The app renders this before opening the stream. `cursor` is the baseline:
 * every event with a higher seq will arrive on `/api/events/station`.
 *
 * Read inside a RepeatableRead transaction so the cursor and the orders come
 * from the same instant. Without that, an order created between the two
 * queries would either be printed twice or missed entirely.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { authenticateDevice } from '@/lib/device-auth';
import { orderFulfillment, resolveRouting } from '@/lib/order-events';
import { getRecallWindowMinutes, isRecallEnabled } from '@/lib/recall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPEN_STATUSES: OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY'];

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateDevice(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { device, station, restaurant } = auth;
    const routing = await resolveRouting(restaurant.id);

    const categories = await prisma.stationCategory.findMany({
      where: { stationId: station.id, category: { isActive: true } },
      select: { category: { select: { id: true, name: true } } },
      orderBy: { category: { displayOrder: 'asc' } },
    });

    const snapshot = await prisma.$transaction(
      async (tx) => {
        const last = await tx.orderEvent.findFirst({
          where: { stationId: station.id },
          orderBy: { id: 'desc' },
          select: { id: true },
        });

        const orders = await tx.order.findMany({
          where: {
            restaurantId: restaurant.id,
            status: { in: OPEN_STATUSES },
          },
          orderBy: { createdAt: 'asc' },
          include: {
            table: { select: { tableNumber: true, tableName: true } },
            orderRecalls: {
              where: { stationId: station.id, resolvedAt: null },
              select: { recalledAt: true, reason: true },
              take: 1,
            },
            items: {
              include: {
                menuItem: { select: { name: true, categoryId: true } },
                selectedOptions: { select: { name: true } },
              },
            },
          },
        });

        return { cursor: last ? Number(last.id) : 0, orders };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );

    const stationId = station.id;

    const orders = snapshot.orders.flatMap((order) => {
      const items = order.items.filter((item) => {
        const routed =
          routing.byCategory.get(item.menuItem.categoryId) ??
          routing.defaultStationId;
        return routed === stationId;
      });

      if (items.length === 0) {
        return [];
      }

      const subtotal = items.reduce(
        (sum, item) => sum + Number(item.totalAmount),
        0
      );
      const fulfillment = orderFulfillment(order);

      return [
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          tableName: fulfillment.fulfillmentLabel,
          ...fulfillment,
          status: order.status,
          version: order.version,
          recalledAt: order.orderRecalls[0]?.recalledAt.toISOString() ?? null,
          recallReason: order.orderRecalls[0]?.reason ?? null,
          createdAt: order.createdAt.toISOString(),
          orderNote: order.specialInstructions,
          stationSubtotal: subtotal.toFixed(2),
          items: items.map((item) => ({
            itemId: item.id,
            name: item.menuItem.name,
            qty: item.quantity,
            modifiers: item.selectedOptions.map((option) => option.name),
            notes: item.specialInstructions,
            status: item.status,
          })),
        },
      ];
    });

    // Best-effort: a reinstall without local storage resumes here instead of
    // replaying the whole log. The client's own cursor still wins if present.
    await prisma.device
      .update({
        where: { id: device.id },
        data: { lastEventId: BigInt(snapshot.cursor) },
      })
      .catch(() => undefined);

    return NextResponse.json({
      serverTime: new Date().toISOString(),
      station: { id: station.id, name: station.name },
      categories: categories.map((row) => row.category),
      cursor: snapshot.cursor,
      recallEnabled: isRecallEnabled(),
      recallWindowMinutes: getRecallWindowMinutes(),
      orders,
    });
  } catch (error) {
    console.error('[station-snapshot] failed:', error);
    return NextResponse.json(
      { error: 'Failed to build station snapshot' },
      { status: 500 }
    );
  }
}
