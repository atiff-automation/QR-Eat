/**
 * Exchange a device secret for a station token.
 *
 * The secret is long-lived but only presented here. The returned JWT is
 * revocable server-side through `devices.tokenVersion`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { signDeviceToken, verifyDeviceSecret } from '@/lib/device-auth';

const TokenSchema = z.object({
  deviceId: z.string().uuid('deviceId must be a uuid'),
  deviceSecret: z.string().min(20, 'Invalid device secret').max(200),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = TokenSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      );
    }

    const { deviceId, deviceSecret } = parsed.data;

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        station: { select: { id: true, name: true, isActive: true } },
        restaurant: { select: { id: true, name: true, isActive: true } },
      },
    });

    // Same response for "unknown device" and "wrong secret": do not let a
    // caller enumerate device ids.
    if (!device || !device.isActive) {
      return NextResponse.json(
        { error: 'Invalid device credentials' },
        { status: 401 }
      );
    }

    const valid = await verifyDeviceSecret(deviceSecret, device.secretHash);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid device credentials' },
        { status: 401 }
      );
    }

    if (!device.restaurant.isActive) {
      return NextResponse.json(
        { error: 'Restaurant is not active' },
        { status: 403 }
      );
    }

    if (!device.station.isActive) {
      return NextResponse.json(
        { error: 'Station is not active' },
        { status: 403 }
      );
    }

    const { token, expiresAt } = signDeviceToken(device);

    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      accessToken: token,
      expiresAt,
      serverTime: new Date().toISOString(),
      device: { id: device.id, name: device.name },
      station: device.station,
      restaurant: device.restaurant,
    });
  } catch (error) {
    console.error('Device token error:', error);
    return NextResponse.json(
      { error: 'Failed to issue device token' },
      { status: 500 }
    );
  }
}
