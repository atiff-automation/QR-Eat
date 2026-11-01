/**
 * Shared authority for kitchen mutations.
 *
 * Web uses RBAC. Station devices authenticate with their device token: the
 * station is the kitchen actor, and the device's station is authoritative.
 */

import type { NextRequest } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { getTokenFromRequest } from '@/lib/auth-utils';
import { authenticateDevice } from '@/lib/device-auth';

export type KitchenActorType = 'web' | 'station';

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
  deviceId?: string;
}

export function kitchenActorAudit(actor: KitchenActor): KitchenActorAudit {
  return {
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorName: actor.actorName,
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

  return null;
}
