/**
 * Shared authority for kitchen mutations.
 *
 * Web uses RBAC; Station uses a staff session bound to a device. A staff
 * session's device station is authoritative, so a body field cannot widen the
 * scope of a kitchen action.
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { getTenantContext } from '@/lib/tenant-context';
import { getTokenFromRequest } from '@/lib/auth-utils';
import { verifyStaffSession } from '@/lib/device-auth';

export interface KitchenActor {
  restaurantId: string;
  actorId?: string;
  actorName?: string;
  canRecall: boolean;
  isManager: boolean;
  deviceStationId?: string;
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
      actorId: context.userId,
      canRecall: true,
      isManager,
    };
  }

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
    actorId: staff.id,
    actorName: `${staff.firstName} ${staff.lastName}`.trim(),
    canRecall: true,
    isManager,
    deviceStationId: device.stationId,
  };
}
