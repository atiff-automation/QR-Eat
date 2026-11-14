/**
 * Trusted client-IP resolution for loyalty rate limits (§18.20.15 B, P7a Q2).
 *
 * A proxy appends the peer address to `X-Forwarded-For`, so the **last** entry
 * is the one the edge observed. A client can prepend anything to the header, so
 * the first entry is never trusted. When the header is absent we use the
 * platform/socket peer address. When neither is available every caller shares
 * one `unknown` sentinel so no one gets an unlimited bucket.
 *
 * The function is pure: it reads only the request and never logs the value.
 * IP addresses are personal data, so the caller must not put them in a response
 * or an error message. `warnIfUnknownTrustedIp` is the only logging helper; it
 * emits one process-wide warning and never includes the address.
 */

/** Shared subject for requests with no trustworthy address. */
export const UNKNOWN_TRUSTED_IP = 'unknown';

let warnedUnknownTrustedIp = false;

/**
 * Log one process-wide warning when the edge did not provide a trusted address.
 *
 * The `unknown` sentinel means every caller shares the strictest rate-limit
 * bucket. That is safe but surprising, so the operator must be told once. The
 * warning never contains the address or any request data. Callers pass the
 * result of `trustedIp`; repeated calls are cheap and only the first logs.
 */
export function warnIfUnknownTrustedIp(ip: string): void {
  if (ip !== UNKNOWN_TRUSTED_IP || warnedUnknownTrustedIp) return;
  warnedUnknownTrustedIp = true;
  console.warn(
    '[loyalty] No trusted client address (X-Forwarded-For is missing); the strictest loyalty rate limit applies to all callers.'
  );
}

/**
 * The minimal request shape needed for resolution. `NextRequest` satisfies it
 * structurally; tests can pass a plain object.
 */
export interface TrustedIpRequest {
  headers: { get(name: string): string | null };
  /** Platform-provided peer address, when the adapter exposes one. */
  ip?: string | null;
  /** Raw socket, when the runtime exposes one. */
  socket?: { remoteAddress?: string | null } | null;
}

function lastForwardedEntry(header: string | null): string | null {
  if (!header) return null;

  const entries = header
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return entries.length > 0 ? entries[entries.length - 1] : null;
}

/**
 * Resolve the address used as the `EDGE_IP` rate-limit subject.
 *
 * Resolution order:
 * 1. the last non-empty `X-Forwarded-For` entry (proxy-appended);
 * 2. the socket peer address;
 * 3. the platform-provided `request.ip`;
 * 4. the shared `unknown` sentinel.
 *
 * `X-Real-IP` and every other client-supplied header are deliberately ignored.
 */
export function trustedIp(request: TrustedIpRequest): string {
  const forwarded = lastForwardedEntry(request.headers.get('x-forwarded-for'));
  if (forwarded) return forwarded;

  const socketAddress = request.socket?.remoteAddress?.trim();
  if (socketAddress) return socketAddress;

  const platformAddress = request.ip?.trim();
  if (platformAddress) return platformAddress;

  return UNKNOWN_TRUSTED_IP;
}
