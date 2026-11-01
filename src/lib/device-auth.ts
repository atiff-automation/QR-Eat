/**
 * Device authentication for station hardware.
 *
 * A station is a phone that was provisioned by a signed-in owner/manager. It
 * holds a long-lived device secret and exchanges it for a JWT. The JWT carries
 * the device's `tokenVersion`, and every request re-checks it against the
 * database, so revoking a lost phone takes effect on its next call.
 */

import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';
import type { Device, Restaurant, Station } from '@prisma/client';
import { prisma } from '@/lib/database';

const DEVICE_ISSUER = 'tabtep-device';
const DEVICE_AUDIENCE = 'tabtep-station';
const DEVICE_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60; // one year; revoke via tokenVersion

const BCRYPT_ROUNDS = 12;

export interface DeviceTokenPayload {
  typ: 'device';
  deviceId: string;
  restaurantId: string;
  stationId: string;
  tokenVersion: number;
}

export type DeviceAuth =
  | {
      ok: true;
      device: Device;
      station: Station;
      restaurant: Restaurant;
    }
  | { ok: false; status: number; error: string };

/**
 * Fail closed. A missing or short secret must never silently fall back to a
 * development value in production.
 */
function signingSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters');
  }
  return secret;
}

export function generateDeviceSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDeviceSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_ROUNDS);
}

export function verifyDeviceSecret(
  secret: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

export function signDeviceToken(
  device: Pick<Device, 'id' | 'restaurantId' | 'stationId' | 'tokenVersion'>
): { token: string; expiresAt: Date } {
  const payload: DeviceTokenPayload = {
    typ: 'device',
    deviceId: device.id,
    restaurantId: device.restaurantId,
    stationId: device.stationId,
    tokenVersion: device.tokenVersion,
  };

  const token = jwt.sign(payload, signingSecret(), {
    algorithm: 'HS256',
    issuer: DEVICE_ISSUER,
    audience: DEVICE_AUDIENCE,
    expiresIn: DEVICE_TOKEN_TTL_SECONDS,
  });

  return {
    token,
    expiresAt: new Date(Date.now() + DEVICE_TOKEN_TTL_SECONDS * 1000),
  };
}

/**
 * Resolves the device behind a Bearer token.
 *
 * Checks the live row on every call: a revoked device, a bumped tokenVersion,
 * a disabled restaurant or a disabled station all invalidate the token even
 * though the JWT itself has not expired.
 */
export async function authenticateDevice(
  request: NextRequest
): Promise<DeviceAuth> {
  const header = request.headers.get('authorization');
  const token =
    header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return { ok: false, status: 401, error: 'Device token required' };
  }

  let payload: DeviceTokenPayload;
  try {
    const decoded = jwt.verify(token, signingSecret(), {
      issuer: DEVICE_ISSUER,
      audience: DEVICE_AUDIENCE,
    });

    if (typeof decoded === 'string' || decoded.typ !== 'device') {
      return { ok: false, status: 401, error: 'Invalid device token' };
    }

    payload = decoded as unknown as DeviceTokenPayload;
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired device token' };
  }

  const device = await prisma.device.findUnique({
    where: { id: payload.deviceId },
    include: { station: true, restaurant: true },
  });

  if (!device || !device.isActive) {
    return { ok: false, status: 401, error: 'Device revoked' };
  }

  if (device.tokenVersion !== payload.tokenVersion) {
    return { ok: false, status: 401, error: 'Device token revoked' };
  }

  if (!device.restaurant.isActive) {
    return { ok: false, status: 403, error: 'Restaurant is not active' };
  }

  if (!device.station.isActive) {
    return { ok: false, status: 403, error: 'Station is not active' };
  }

  // Presence tracking is best-effort and throttled: it must never fail a
  // request, and it must not write on every poll.
  const now = Date.now();
  if (!device.lastSeenAt || now - device.lastSeenAt.getTime() > 60_000) {
    prisma.device
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    ok: true,
    device,
    station: device.station,
    restaurant: device.restaurant,
  };
}
