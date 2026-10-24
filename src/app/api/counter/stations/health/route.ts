import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * GET /api/counter/stations/health
 *
 * Manager/cashier-readable kitchen station health. "online" means the device
 * checked in within the window; printer state is not claimed unless the
 * station has a successful print ACK.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    let restaurantId = context!.restaurantId;
    if (!restaurantId && context!.isAdmin) {
      restaurantId =
        new URL(request.url).searchParams.get('restaurantId') || undefined;
    }

    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const stations = await prisma.station.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        isActive: true,
        devices: {
          select: {
            id: true,
            name: true,
            isActive: true,
            lastSeenAt: true,
            lastPrintAt: true,
            appVersion: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      stations: stations.map((station) => {
        const activeDevices = station.devices.filter(
          (device) => device.isActive
        );
        const onlineDevices = activeDevices.filter(
          (device) =>
            device.lastSeenAt &&
            now - device.lastSeenAt.getTime() <= ONLINE_WINDOW_MS
        );
        const lastPrintAt = activeDevices
          .map((device) => device.lastPrintAt)
          .filter((value): value is Date => value instanceof Date)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        const health =
          !station.isActive || activeDevices.length === 0
            ? 'unknown'
            : onlineDevices.length > 0
              ? 'online'
              : 'offline';

        return {
          id: station.id,
          name: station.name,
          isActive: station.isActive,
          health,
          deviceCount: station.devices.length,
          activeDeviceCount: activeDevices.length,
          onlineDeviceCount: onlineDevices.length,
          lastSeenAt:
            activeDevices
              .map((device) => device.lastSeenAt)
              .filter((value): value is Date => value instanceof Date)
              .sort((a, b) => b.getTime() - a.getTime())[0] || null,
          lastPrintAt: lastPrintAt || null,
          printerStatus: lastPrintAt ? 'last-print-seen' : 'unknown',
          devices: station.devices,
        };
      }),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CounterStationHealth] Error:', error);
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
      { success: false, error: 'Failed to load station health' },
      { status: 500 }
    );
  }
}
