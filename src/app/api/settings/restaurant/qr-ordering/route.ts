/**
 * PATCH /api/settings/restaurant/qr-ordering
 *
 * Manual pause/resume for customer QR ordering. The automatic pause is derived
 * from Counter presence at order-creation time; this endpoint only stores the
 * owner/manager intent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';

const BodySchema = z.object({
  paused: z.boolean(),
  reason: z.string().trim().max(200).optional().nullable(),
});

export async function PATCH(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'settings', 'write');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Restaurant context is required',
          code: 'RESTAURANT_CONTEXT_REQUIRED',
        },
        { status: 400 }
      );
    }

    await requireRestaurantAccess(restaurantId, context!);

    const body = BodySchema.parse(await request.json());
    const now = new Date();
    const reason = body.reason?.trim() || null;

    const current = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { qrOrderingPaused: true, qrOrderingPausedReason: true },
    });

    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: body.paused
        ? {
            qrOrderingPaused: true,
            qrOrderingPausedAt: now,
            qrOrderingPausedBy: context!.userId,
            qrOrderingPausedReason:
              reason || 'Paused by owner/manager from the dashboard.',
          }
        : {
            qrOrderingPaused: false,
            qrOrderingPausedAt: null,
            qrOrderingPausedBy: null,
            qrOrderingPausedReason: null,
          },
      select: {
        qrOrderingPaused: true,
        qrOrderingPausedAt: true,
        qrOrderingPausedBy: true,
        qrOrderingPausedReason: true,
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          tableName: 'restaurants',
          recordId: restaurantId,
          operation: 'UPDATE',
          oldValues: {
            qrOrderingPaused: current.qrOrderingPaused,
            qrOrderingPausedReason: current.qrOrderingPausedReason,
          },
          newValues: {
            qrOrderingPaused: updated.qrOrderingPaused,
            qrOrderingPausedReason: updated.qrOrderingPausedReason,
          },
          changedBy: context!.userId,
          changedByType: context!.userType,
          restaurantId,
          category: 'orders',
          description: updated.qrOrderingPaused
            ? 'Manual pause of online QR ordering'
            : 'Manual resume of online QR ordering',
        },
      });
    } catch (auditError) {
      // The pause itself must not fail because the audit write failed.
      console.error('[QrOrdering] Failed to write pause audit:', auditError);
    }

    return NextResponse.json({
      success: true,
      qrOrdering: updated,
      serverTime: now.toISOString(),
    });
  } catch (error) {
    console.error('[QrOrdering] PATCH failed:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('Access denied')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 403 }
        );
      }
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
      { success: false, error: 'Failed to update QR ordering' },
      { status: 500 }
    );
  }
}
