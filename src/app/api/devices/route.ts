/**
 * Device listing for the owner console.
 *
 * Never returns `secretHash` and never returns the pairing code: the code is
 * readable only on demand (`GET /devices/{id}/code`) so it is on screen only
 * while the owner is deliberately showing it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { RESTAURANT_PERMISSIONS } from '@/lib/rbac/permission-constants';

const deviceSelect = {
  id: true,
  name: true,
  platform: true,
  appVersion: true,
  deviceModel: true,
  isActive: true,
  pairedAt: true,
  lastSeenAt: true,
  lastPrintAt: true,
  createdAt: true,
  station: { select: { id: true, name: true, isActive: true } },
} as const;

export async function GET(request: NextRequest) {
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

    const devices = await prisma.device.findMany({
      where: { restaurantId },
      select: { ...deviceSelect, pairingCode: true },
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json({
      success: true,
      devices: devices.map(({ pairingCode, ...device }) => ({
        ...device,
        hasPendingCode: pairingCode !== null,
      })),
    });
  } catch (error) {
    console.error('List devices error:', error);
    return NextResponse.json(
      { error: 'Failed to list devices' },
      { status: 500 }
    );
  }
}
