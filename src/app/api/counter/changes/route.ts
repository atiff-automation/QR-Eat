/**
 * GET /api/counter/changes?since=<seq>&limit=<n>
 *
 * Durable cache-invalidation feed for the Counter. The client advances its
 * cursor and refreshes the affected snapshots; this endpoint does not replace
 * the authoritative list/bill endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const since = Number(url.searchParams.get('since') ?? '0');
    const requestedLimit = Number(url.searchParams.get('limit') ?? '50');
    if (!Number.isSafeInteger(since) || since < 0) {
      return NextResponse.json(
        { success: false, error: 'since must be a non-negative integer' },
        { status: 400 }
      );
    }
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(1, Math.trunc(requestedLimit)), 100)
      : 50;

    const latest = await prisma.restaurantChange.findFirst({
      where: { restaurantId },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const cursor = latest ? Number(latest.id) : 0;

    // A first sync must not replay the whole history. The client follows this
    // with a full snapshot and starts from the returned cursor.
    if (since === 0) {
      return NextResponse.json({
        success: true,
        changes: [],
        cursor,
        nextSeq: cursor,
        hasMore: false,
        serverTime: new Date().toISOString(),
      });
    }

    const rows = await prisma.restaurantChange.findMany({
      where: {
        restaurantId,
        id: { gt: BigInt(since) },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        operation: true,
        createdAt: true,
      },
    });

    const page = rows.slice(0, limit);
    const nextSeq = page.length > 0 ? Number(page[page.length - 1].id) : since;

    return NextResponse.json({
      success: true,
      changes: page.map((row) => ({
        seq: Number(row.id),
        entityType: row.entityType,
        entityId: row.entityId,
        operation: row.operation,
        createdAt: row.createdAt.toISOString(),
      })),
      cursor,
      nextSeq,
      hasMore: rows.length > limit,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CounterChanges] Error:', error);
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 403 }
        );
      }
    }
    return NextResponse.json(
      { success: false, error: 'Failed to load Counter changes' },
      { status: 500 }
    );
  }
}
