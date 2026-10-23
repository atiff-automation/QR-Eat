/**
 * Unlock a station with a staff PIN.
 *
 * A device session proves *which phone* this is. A staff session proves *who*
 * is using it. PINs are per staff member and bcrypt-hashed; there is no
 * plaintext PIN on the server.
 *
 * Wrong PINs are counted per device, with exponential backoff. A stolen phone
 * must not be a 10,000-guess oracle.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { authenticateDevice, signStaffSession } from '@/lib/device-auth';

const StaffSessionSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits'),
});

const FREE_ATTEMPTS = 5;
const BASE_LOCK_MINUTES = 1;
const MAX_LOCK_MINUTES = 60;

export async function POST(request: NextRequest) {
  try {
    const deviceAuth = await authenticateDevice(request);
    if (!deviceAuth.ok) {
      return NextResponse.json(
        { error: deviceAuth.error },
        { status: deviceAuth.status }
      );
    }

    const { device, restaurant } = deviceAuth;
    const now = new Date();

    if (device.pinLockedUntil && device.pinLockedUntil > now) {
      const retryAfterSeconds = Math.ceil(
        (device.pinLockedUntil.getTime() - now.getTime()) / 1000
      );
      return NextResponse.json(
        {
          error: 'Too many wrong PINs. Try again later.',
          retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const parsed = StaffSessionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid PIN' },
        { status: 400 }
      );
    }

    const { pin } = parsed.data;

    const candidates = await prisma.staff.findMany({
      where: {
        restaurantId: restaurant.id,
        isActive: true,
        pinHash: { not: null },
      },
      include: { role: { select: { id: true, name: true } } },
    });

    let matched: (typeof candidates)[number] | null = null;
    for (const staff of candidates) {
      // pinHash is non-null by the query, but keep the type honest.
      if (staff.pinHash && (await bcrypt.compare(pin, staff.pinHash))) {
        matched = staff;
        break;
      }
    }

    if (!matched) {
      const attempts = device.failedPinAttempts + 1;
      const lockMinutes =
        attempts <= FREE_ATTEMPTS
          ? 0
          : Math.min(
              BASE_LOCK_MINUTES * 2 ** (attempts - FREE_ATTEMPTS - 1),
              MAX_LOCK_MINUTES
            );

      await prisma.device.update({
        where: { id: device.id },
        data: {
          failedPinAttempts: attempts,
          pinLockedUntil:
            lockMinutes > 0
              ? new Date(now.getTime() + lockMinutes * 60_000)
              : null,
        },
      });

      // Deliberately identical for "no staff has a PIN" and "wrong PIN".
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    await prisma.device.update({
      where: { id: device.id },
      data: { failedPinAttempts: 0, pinLockedUntil: null },
    });

    const session = signStaffSession({
      staffId: matched.id,
      restaurantId: restaurant.id,
      deviceId: device.id,
      roleId: matched.roleId,
    });

    return NextResponse.json({
      success: true,
      staffToken: session.token,
      expiresAt: session.expiresAt,
      staff: {
        id: matched.id,
        name: `${matched.firstName} ${matched.lastName}`.trim(),
        role: matched.role.name,
      },
    });
  } catch (error) {
    console.error('Staff session error:', error);
    return NextResponse.json(
      { error: 'Failed to open staff session' },
      { status: 500 }
    );
  }
}
