import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SessionDeviceType } from '@/lib/rbac/types';

export const DEVICE_COOKIE_NAME = 'qr_device_id';
export const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function normalizeDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return DEVICE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function normalizeDeviceType(
  value: unknown,
  userAgent?: string | null
): SessionDeviceType {
  if (value === 'counter' || value === 'web') return value;
  return /okhttp|tabtep-counter/i.test(userAgent || '') ? 'counter' : 'web';
}

/**
 * Resolve a device identity without making it an authentication factor.
 *
 * Web clients get a server-generated HTTP-only cookie. The Counter sends its
 * installation ID in the login body. Legacy clients without either value keep
 * working with no device identity.
 */
export function resolveDeviceId(
  request: NextRequest,
  supplied: unknown,
  deviceType: SessionDeviceType
): string | null {
  const bodyDeviceId = normalizeDeviceId(supplied);
  if (bodyDeviceId) return bodyDeviceId;

  const cookieDeviceId = normalizeDeviceId(
    request.cookies.get(DEVICE_COOKIE_NAME)?.value
  );
  if (cookieDeviceId) return cookieDeviceId;

  // Old Counter builds do not send a device ID. Do not invent a new cookie
  // that OkHttp will not retain.
  if (deviceType === 'counter') return null;

  return randomUUID();
}

export function setDeviceCookie(
  response: NextResponse,
  request: NextRequest,
  deviceId: string
): void {
  const host = request.headers.get('host')?.split(':')[0] || '';
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN;
  const useDomain =
    baseDomain && (host === baseDomain || host.endsWith(`.${baseDomain}`));

  response.cookies.set({
    name: DEVICE_COOKIE_NAME,
    value: deviceId,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DEVICE_COOKIE_MAX_AGE,
    path: '/',
    ...(useDomain ? { domain: `.${baseDomain}` } : {}),
  });
}
