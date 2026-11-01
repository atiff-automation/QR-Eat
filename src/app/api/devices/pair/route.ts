/**
 * Redeem a station pairing code.
 *
 * This is the only unauthenticated device endpoint: the code is the credential.
 * Redemption is a compare-and-set on `pairingCode`, so two simultaneous
 * attempts cannot both succeed, and the real device secret is minted here and
 * returned exactly once.
 *
 * A bad code is `400`, never `401`: the Station treats `401` as "refresh the
 * device token", and a mistyped code is not that.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  generateDeviceSecret,
  hashDeviceSecret,
  signDeviceToken,
} from '@/lib/device-auth';
import { isValidPairingCode, normalizePairingCode } from '@/lib/pairing-code';

/**
 * One message for unknown, already used and already paired. The installer can
 * only act on "get a new code", and separate messages would let a caller
 * enumerate live codes.
 */
const INVALID_CODE = 'This code is not valid. Generate a new one.';

const PairSchema = z.object({
  code: z.string().trim().min(1).max(64),
  platform: z.string().trim().max(20).optional(),
  appVersion: z.string().trim().max(30).optional(),
  deviceModel: z.string().trim().max(60).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = PairSchema.safeParse(await request.json());
    if (!parsed.success || !isValidPairingCode(parsed.data.code)) {
      return NextResponse.json({ error: INVALID_CODE }, { status: 400 });
    }

    const { code, platform, appVersion, deviceModel } = parsed.data;
    const pairingCode = normalizePairingCode(code);

    const device = await prisma.device.findUnique({
      where: { pairingCode },
      include: {
        station: { select: { id: true, name: true, isActive: true } },
        restaurant: { select: { id: true, name: true, isActive: true } },
      },
    });

    // A paired device has no code, so a miss already covers "already used".
    if (!device || device.isActive) {
      return NextResponse.json({ error: INVALID_CODE }, { status: 400 });
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

    const deviceSecret = generateDeviceSecret();
    const secretHash = await hashDeviceSecret(deviceSecret);
    const now = new Date();

    // Compare-and-set: the where clause still names the code, so a concurrent
    // redemption updates zero rows and loses the race instead of double-pairing.
    const claimed = await prisma.device.updateMany({
      where: { id: device.id, pairingCode, isActive: false },
      data: {
        secretHash,
        pairingCode: null,
        isActive: true,
        pairedAt: now,
        lastSeenAt: now,
        ...(platform ? { platform } : {}),
        ...(appVersion ? { appVersion } : {}),
        ...(deviceModel ? { deviceModel } : {}),
      },
    });

    if (claimed.count === 0) {
      return NextResponse.json({ error: INVALID_CODE }, { status: 400 });
    }

    const { token, expiresAt } = signDeviceToken(device);

    return NextResponse.json({
      success: true,
      deviceId: device.id,
      deviceSecret,
      accessToken: token,
      expiresAt,
      serverTime: now.toISOString(),
      device: { id: device.id, name: device.name },
      station: { id: device.station.id, name: device.station.name },
      restaurant: { id: device.restaurant.id, name: device.restaurant.name },
    });
  } catch (error) {
    console.error('Device pair error:', error);
    return NextResponse.json(
      { error: 'Failed to pair device' },
      { status: 500 }
    );
  }
}
