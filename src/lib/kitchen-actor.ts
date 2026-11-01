/**
 * Shared authority for kitchen mutations.
 *
 * Web uses RBAC. Station devices authenticate with their device token: the
 * station is the kitchen actor, and the device's station is authoritative.
 * Staff sessions remain temporarily supported while the Station app moves to
 * station authentication.
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { getTenantContext } from '@/lib/tenant-context';
import { getTokenFromRequest } from '@/lib/auth-utils';
import { authenticateDevice, verifyStaffSession } from '@/lib/device-auth';

export type KitchenActorType = 'web' | 'staff' | 'station';

export interface KitchenActor {
  restaurantId: string;
  actorType: KitchenActorType;
  actorId?: string;
  actorName?: string;
  canRecall: boolean;
  isManager: boolean;
  deviceId?: string;
  stationId?: string;
}

export interface KitchenActorAudit {
  actorType: KitchenActorType;
  actorId?: string;
  actorName?: string;
  staffId?: string;
  staffName?: string;
  deviceId?: string;
}

export function kitchenActorAudit(actor: KitchenActor): KitchenActorAudit {
  return {
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorName: actor.actorName,
    staffId: actor.actorType === 'staff' ? actor.actorId : undefined,
    staffName: actor.actorType === 'staff' ? actor.actorName : undefined,
    deviceId: actor.deviceId,
  };
}

export async function resolveKitchenActor(
  request: NextRequest
): Promise<KitchenActor | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const context = await getTenantContext(request);
  if (context) {
    if (context.isAdmin) {
      return context.restaurantId
        ? {
            restaurantId: context.restaurantId,
            actorType: 'web',
            actorId: context.userId,
            canRecall: true,
            isManager: true,
          }
        : null;
    }

    const isManager =
      context.userType === 'restaurant_owner' ||
      (context.userType === 'staff' && context.roleTemplate === 'manager');
    const canKitchen =
      context.roleTemplate === 'kitchen_staff' ||
      (context.permissions.orders ?? []).includes('kitchen') ||
      (context.permissions.kitchen ?? []).includes('write');

    if (!context.restaurantId || (!isManager && !canKitchen)) return null;
    return {
      restaurantId: context.restaurantId,
      actorType: 'web',
      actorId: context.userId,
      canRecall: true,
      isManager,
    };
  }

  // A station device is a first-class kitchen actor. authenticateDevice
  // re-checks the live device, restaurant and station rows on every call, so
  // revocation is immediate.
  const deviceAuth = await authenticateDevice(request);
  if (deviceAuth.ok) {
    return {
      restaurantId: deviceAuth.device.restaurantId,
      actorType: 'station',
      actorId: deviceAuth.device.id,
      actorName: deviceAuth.device.name || deviceAuth.station.name,
      canRecall: true,
      isManager: false,
      deviceId: deviceAuth.device.id,
      stationId: deviceAuth.device.stationId,
    };
  }

  // Transitional: the current Station app still opens a staff session. Remove
  // this branch after the KDS switch and the old APK are gone.
  const session = verifyStaffSession(token);
  if (!session) return null;

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    include: {
      role: { select: { permissions: true, level: true, name: true } },
      restaurant: { select: { id: true } },
    },
  });
  if (
    !staff ||
    !staff.isActive ||
    staff.restaurantId !== session.restaurantId ||
    !staff.restaurant
  ) {
    return null;
  }

  const device = await prisma.device.findUnique({
    where: { id: session.deviceId },
    select: { restaurantId: true, stationId: true, isActive: true },
  });
  if (
    !device ||
    !device.isActive ||
    device.restaurantId !== staff.restaurantId
  ) {
    return null;
  }

  const permissions = staff.role.permissions as Record<string, unknown>;
  const kitchen = permissions.kitchen;
  const canKitchen = Array.isArray(kitchen) && kitchen.includes('write');
  const isManager =
    staff.role.level >= 8 || /manager|owner/i.test(staff.role.name);

  if (!isManager && !canKitchen) return null;

  return {
    restaurantId: staff.restaurantId,
    actorType: 'staff',
    actorId: staff.id,
    actorName: `${staff.firstName} ${staff.lastName}`.trim(),
    canRecall: true,
    isManager,
    deviceId: session.deviceId,
    stationId: device.stationId,
  };
}
