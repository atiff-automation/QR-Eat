/**
 * Provision a station device.
 *
 * Called once per install by a signed-in owner/manager. Returns the device
 * secret exactly once; the server stores only its bcrypt hash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { RESTAURANT_PERMISSIONS } from '@/lib/rbac/permission-constants';
import { generateDeviceSecret, hashDeviceSecret } from '@/lib/device-auth';

const ProvisionSchema = z.object({
  name: z.string().trim().min(1, 'Device name is required').max(60),
  stationId: z.string().uuid('stationId must be a uuid'),
  platform: z.string().trim().max(20).optional(),
  appVersion: z.string().trim().max(30).optional(),
  deviceModel: z.string().trim().max(60).optional(),
});

export async function POST(request: NextRequest) {
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

    const parsed = ProvisionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      );
    }

    const { name, stationId, platform, appVersion, deviceModel } = parsed.data;

    const station = await prisma.station.findFirst({
      where: { id: stationId, restaurantId, isActive: true },
      select: { id: true, name: true },
    });

    if (!station) {
      return NextResponse.json(
        { error: 'Station not found or inactive' },
        { status: 404 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    const deviceSecret = generateDeviceSecret();

    const device = await prisma.device.create({
      data: {
        restaurantId,
        stationId: station.id,
        name,
        platform: platform ?? 'android',
        appVersion: appVersion ?? null,
        deviceModel: deviceModel ?? null,
        secretHash: await hashDeviceSecret(deviceSecret),
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        deviceId: device.id,
        deviceSecret,
        name: device.name,
        station,
        restaurant,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Device provision error:', error);
    return NextResponse.json(
      { error: 'Failed to provision device' },
      { status: 500 }
    );
  }
}
