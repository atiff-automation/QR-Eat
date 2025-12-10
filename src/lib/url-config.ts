/**
 * Centralized URL Configuration
 *
 * Single Source of Truth for all application URLs.
 * Follows coding standards: No hardcoding, environment variable usage.
 */

import { NextRequest } from 'next/server';

interface UrlConfig {
  baseUrl: string;
  appUrl: string;
}

/**
 * Get the application base URL from environment or request
 * Priority: request origin > APP_URL env > NEXT_PUBLIC_BASE_URL env > error
 *
 * @param request - Optional NextRequest to extract origin header
 * @returns Base URL without trailing slash
 * @throws Error if no valid URL source is found
 */
export function getBaseUrl(request?: NextRequest): string {
  // Priority 1: Request origin header (most reliable in production)
  if (request) {
    const origin = request.headers.get('origin') || request.headers.get('host');
    if (origin) {
      // If host header, add protocol
      return origin.startsWith('http') ? origin : `https://${origin}`;
    }
  }

  // Priority 2: APP_URL environment variable (Railway/production)
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, ''); // Remove trailing slash
  }

  // Priority 3: NEXT_PUBLIC_BASE_URL (legacy support)
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  // Priority 4: NEXTAUTH_URL (fallback)
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  }

  // Error: No valid URL source found
  throw new Error(
    'Base URL not configured. Please set APP_URL or NEXT_PUBLIC_BASE_URL environment variable.'
  );
}

/**
 * Get the application configuration URLs
 *
 * @param request - Optional NextRequest for origin detection
 * @returns UrlConfig object with all configured URLs
 */
export function getUrlConfig(request?: NextRequest): UrlConfig {
  const baseUrl = getBaseUrl(request);

  return {
    baseUrl,
    appUrl: baseUrl,
  };
}

/**
 * Build a full URL with the application base URL
 *
 * @param path - Path to append to base URL (with or without leading slash)
 * @param request - Optional NextRequest for origin detection
 * @returns Full URL
 */
export function buildUrl(path: string, request?: NextRequest): string {
  const baseUrl = getBaseUrl(request);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Build a QR code URL for a table
 *
 * @param qrToken - QR code token
 * @param request - Optional NextRequest for origin detection
 * @returns Full QR code URL
 */
export function buildQrCodeUrl(qrToken: string, request?: NextRequest): string {
  return buildUrl(`/qr/${qrToken}`, request);
}

/**
 * Build a login URL
 *
 * @param request - Optional NextRequest for origin detection
 * @returns Full login URL
 */
export function buildLoginUrl(request?: NextRequest): string {
  return buildUrl('/login', request);
}

/**
 * Build a password reset URL
 *
 * @param resetToken - Password reset token
 * @param request - Optional NextRequest for origin detection
 * @returns Full password reset URL
 */
export function buildPasswordResetUrl(
  resetToken: string,
  request?: NextRequest
): string {
  return buildUrl(`/reset-password?token=${resetToken}`, request);
}
