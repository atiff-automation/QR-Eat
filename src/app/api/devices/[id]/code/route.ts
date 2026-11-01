/**
 * Pairing code for one device: reissue (`POST`) or reveal (`GET`).
 *
 * The code is deliberately absent from the device list, so it is on screen only
 * when the owner asks for it. Reissue is the recovery path after an uninstall,
 * a factory reset or a hardware swap: the same device row keeps its name,
 * station and history, so the tablet re-pairs onto the identity it had before.
 *
 * A code only exists on a device that is not yet paired, which means an active
 * device must be revoked before a new code can be issued.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { RESTAURANT_PERMISSIONS } from '@/lib/rbac/permission-constants';
import { formatPairingCode, generatePairingCode } from '@/lib/pairing-code';

async function resolveScope(
  request: NextRequest,
  params: Promise<{ id: string }>
) {
  const auth = await requireAuth(request, [RESTAURANT_PERMISSIONS.SETTINGS]);
  if (!auth.success) {
    return {
      error: NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      ),
    };
  }

  const restaurantId = auth.user?.restaurantContext?.id;
  if (!restaurantId) {
    return {
      error: NextResponse.json(
        { error: 'No restaurant context on this session' },
        { status: 403 }
      ),
    };
  }

  const { id } = await params;

  const device = await prisma.device.findFirst({
    where: { id, restaurantId },
    select: {
      id: true,
      name: true,
      isActive: true,
      pairingCode: true,
      pairedAt: true,
      station: { select: { id: true, name: true, isActive: true } },
    },
  });

  if (!device) {
    return {
      error: NextResponse.json({ error: 'Device not found' }, { status: 404 }),
    };
  }

  return { device };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await resolveScope(request, params);
    if (scope.error || !scope.device) return scope.error;

    const { device } = scope;

    if (!device.pairingCode) {
      return NextResponse.json(
        {
          error: device.isActive
            ? 'This device is already paired.'
            : 'No pairing code for this device. Create one first.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      deviceId: device.id,
      pairingCode: formatPairingCode(device.pairingCode),
      station: device.station,
    });
  } catch (error) {
    console.error('Read pairing code error:', error);
    return NextResponse.json(
      { error: 'Failed to read pairing code' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await resolveScope(request, params);
    if (scope.error || !scope.device) return scope.error;

    const { device } = scope;

    if (device.isActive) {
      return NextResponse.json(
        { error: 'Revoke this device before creating a pairing code.' },
        { status: 409 }
      );
    }

    // A collision in a 40-bit space across a handful of devices is not a real
    // failure mode; the unique index would surface it as a 500 and the owner
    // would simply ask again.
    const pairingCode = generatePairingCode();

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { pairingCode },
      select: { id: true, pairingCode: true },
    });

    return NextResponse.json({
      success: true,
      deviceId: updated.id,
      pairingCode: formatPairingCode(updated.pairingCode ?? pairingCode),
      station: device.station,
    });
  } catch (error) {
    console.error('Create pairing code error:', error);
    return NextResponse.json(
      { error: 'Failed to create pairing code' },
      { status: 500 }
    );
  }
}
