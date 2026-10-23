/**
 * Rename a device, move it to another station, or disable it.
 *
 * Disabling also bumps `tokenVersion`, which invalidates the token the phone
 * is currently holding. Re-enabling does not restore it; the phone must
 * exchange its secret again.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { RESTAURANT_PERMISSIONS } from '@/lib/rbac/permission-constants';

const UpdateDeviceSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    stationId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No fields to update',
  });

const deviceSelect = {
  id: true,
  name: true,
  platform: true,
  appVersion: true,
  deviceModel: true,
  isActive: true,
  lastSeenAt: true,
  lastPrintAt: true,
  createdAt: true,
  station: { select: { id: true, name: true, isActive: true } },
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, [RESTAURANT_PERMISSIONS.SETTINGS]);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    const restaurantId = auth.user?.restaurantContext?.id;
    if (!restaurantId) {
      return NextResponse.json(
        { error: 'No restaurant context on this session' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const parsed = UpdateDeviceSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      );
    }

    const { name, stationId, isActive } = parsed.data;

    const existing = await prisma.device.findFirst({
      where: { id, restaurantId },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (stationId) {
      const station = await prisma.station.findFirst({
        where: { id: stationId, restaurantId, isActive: true },
        select: { id: true },
      });

      if (!station) {
        return NextResponse.json(
          { error: 'Station not found or inactive' },
          { status: 404 }
        );
      }
    }

    const device = await prisma.device.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(stationId !== undefined ? { stationId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        // Disabling is a revocation: never leave a live token behind.
        ...(isActive === false ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: deviceSelect,
    });

    return NextResponse.json({ success: true, device });
  } catch (error) {
    console.error('Update device error:', error);
    return NextResponse.json(
      { error: 'Failed to update device' },
      { status: 500 }
    );
  }
}
