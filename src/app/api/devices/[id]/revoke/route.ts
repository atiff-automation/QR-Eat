/**
 * Revoke a lost or stolen station phone.
 *
 * The row is kept for history; `isActive` and a bumped `tokenVersion` make the
 * phone's current token useless on its next request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { RESTAURANT_PERMISSIONS } from '@/lib/rbac/permission-constants';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';

export async function POST(
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

    const existing = await prisma.device.findFirst({
      where: { id, restaurantId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const device = await prisma.device.update({
      where: { id },
      data: {
        isActive: false,
        tokenVersion: { increment: 1 },
      },
      select: { id: true, name: true, isActive: true, tokenVersion: true },
    });

    await AuditLogger.logSecurityEvent(
      auth.user?.id || 'unknown',
      'DEVICE_REVOKED',
      'high',
      `Station device ${device.name} revoked`,
      {
        ipAddress: SecurityUtils.getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          deviceId: device.id,
          deviceName: device.name,
          restaurantId,
          tokenVersion: device.tokenVersion,
        },
      }
    );

    return NextResponse.json({ success: true, device });
  } catch (error) {
    console.error('Revoke device error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke device' },
      { status: 500 }
    );
  }
}
