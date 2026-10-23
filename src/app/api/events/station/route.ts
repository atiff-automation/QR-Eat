/**
 * Per-station event stream.
 *
 * Auth: device token (Bearer). The device's station is read from the database
 * on every connection, so reassigning a phone changes its feed immediately.
 *
 * Resume: `?since=<seq>` or the standard `Last-Event-ID` header. The server
 * falls back to the cursor it last handed this device.
 *
 * Delivery is pull-based (one indexed query per second) rather than NOTIFY.
 * It cannot miss an event if a listener drops, and a kitchen ticket is not
 * sub-second work.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { authenticateDevice } from '@/lib/device-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 7;
const POLL_MS = 1000;
const PING_MS = 15_000;
const BATCH = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const auth = await authenticateDevice(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { device, station, restaurant } = auth;

  const raw =
    request.nextUrl.searchParams.get('since') ??
    request.headers.get('last-event-id');

  const since = raw !== null ? Number(raw) : Number(device.lastEventId);
  if (!Number.isSafeInteger(since) || since < 0) {
    return NextResponse.json(
      { error: 'since must be a non-negative integer' },
      { status: 400 }
    );
  }

  // A cursor older than retention cannot be replayed without a snapshot.
  if (since > 0) {
    const next = await prisma.orderEvent.findFirst({
      where: {
        restaurantId: restaurant.id,
        stationId: station.id,
        id: { gt: BigInt(since) },
      },
      orderBy: { id: 'asc' },
      select: { createdAt: true },
    });

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    if (next && next.createdAt < cutoff) {
      return NextResponse.json(
        {
          error: 'CURSOR_EXPIRED',
          message: 'Cursor is older than the replay window',
          snapshot: '/api/stations/me/snapshot',
        },
        { status: 410 }
      );
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let cursor = since;
      let lastPing = Date.now();
      let persisted = Number(device.lastEventId);

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      request.signal.addEventListener('abort', close);

      const send = (chunk: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          close();
          return false;
        }
      };

      send('retry: 3000\n\n');

      try {
        while (!closed) {
          const events = await prisma.orderEvent.findMany({
            where: {
              restaurantId: restaurant.id,
              stationId: station.id,
              id: { gt: BigInt(cursor) },
            },
            orderBy: { id: 'asc' },
            take: BATCH,
            select: {
              id: true,
              type: true,
              orderId: true,
              payload: true,
              createdAt: true,
            },
          });

          if (events.length > 0) {
            for (const event of events) {
              cursor = Number(event.id);

              const frame = {
                seq: cursor,
                type: event.type,
                occurredAt: event.createdAt.toISOString(),
                stationId: station.id,
                orderId: event.orderId,
                payload: event.payload,
              };

              if (
                !send(
                  `id: ${cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(frame)}\n\n`
                )
              ) {
                break;
              }
            }

            if (!closed && cursor !== persisted) {
              await prisma.device
                .update({
                  where: { id: device.id },
                  data: { lastEventId: BigInt(cursor) },
                })
                .catch(() => undefined);
              persisted = cursor;
            }

            continue;
          }

          if (Date.now() - lastPing >= PING_MS) {
            if (!send(': ping\n\n')) break;
            lastPing = Date.now();
          }

          await sleep(POLL_MS);
        }
      } catch (error) {
        console.error('[station-stream] stream failed:', error);
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
