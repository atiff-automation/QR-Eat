/**
 * Trusted client-IP resolution for loyalty rate limits (§18.20.15 B, P9-10a).
 *
 * Railway's edge **prepends** the client to `X-Forwarded-For` and appends an
 * internal hop that changes per connection. It also sets `X-Real-IP` to the
 * client and overwrites any client-supplied value. The client address is
 * therefore `X-Real-IP`, with the first `X-Forwarded-For` entry as a fallback,
 * and only when `RAILWAY_ENVIRONMENT` is set. Off-Railway neither header is
 * trusted: without a proxy they are client-controlled.
 *
 * A candidate must be a globally routable address. Private, loopback,
 * link-local, CGNAT, unspecified and multicast values can never become a
 * rate-limit subject. When no trusted address is available every caller shares
 * one `unknown` sentinel so no one gets an unlimited bucket.
 *
 * The resolver is pure: it reads only the request and never logs the value.
 * IP addresses are personal data, so the caller must not put them in a response
 * or an error message. `warnIfUnknownTrustedIp` and
 * `warnIfEdgeHeadersDisagree` are the only logging helpers; each emits one
 * process-wide warning and never includes an address.
 */

import { isIP } from 'net';

/** Shared subject for requests with no trustworthy address. */
export const UNKNOWN_TRUSTED_IP = 'unknown';

/** Where the resolved address came from. */
export type ClientIpSource =
  | 'x-real-ip'
  | 'x-forwarded-for'
  | 'socket'
  | 'unknown';

/** The resolver's result. `xffEntries` counts non-empty comma entries. */
export interface ResolvedClientIp {
  ip: string;
  source: ClientIpSource;
  xffEntries: number;
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

let warnedUnknownTrustedIp = false;
let warnedEdgeHeadersDisagree = false;

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
 * Log one process-wide canary when the edge headers name different clients.
 *
 * `X-Real-IP` and `X-Forwarded-For[0]` are expected to be the same address.
 * If they disagree, the edge behaviour changed and the resolved client address
 * may be wrong, so the operator must be told once. The warning never contains
 * an address or any request data.
 */
export function warnIfEdgeHeadersDisagree(
  xRealIp: string | null | undefined,
  xffFirst: string | null | undefined
): void {
  if (warnedEdgeHeadersDisagree) return;

  const real = normaliseClientIp(xRealIp);
  const forwarded = normaliseClientIp(xffFirst);
  if (real === null || forwarded === null || real === forwarded) return;

  warnedEdgeHeadersDisagree = true;
  console.warn(
    '[loyalty] Edge headers disagree (X-Real-IP vs X-Forwarded-For[0]); the client address may be misconfigured.'
  );
}

/**
 * Resolve the client address and where it came from.
 *
 * Resolution order:
 * 1. on Railway, `X-Real-IP` (validated);
 * 2. on Railway, the first non-empty `X-Forwarded-For` entry (validated);
 * 3. the socket peer address, when globally routable;
 * 4. the platform-provided `request.ip`, under the same rule;
 * 5. the shared `unknown` sentinel.
 *
 * Off-Railway the headers are deliberately ignored.
 */
export function resolveClientIp(request: TrustedIpRequest): ResolvedClientIp {
  const forwarded = splitForwardedEntries(
    request.headers.get('x-forwarded-for')
  );
  const xffEntries = forwarded.length;
  const xRealIp = request.headers.get('x-real-ip');

  if (process.env.RAILWAY_ENVIRONMENT) {
    warnIfEdgeHeadersDisagree(xRealIp, forwarded[0]);

    const real = normaliseClientIp(xRealIp);
    if (real !== null) {
      return { ip: real, source: 'x-real-ip', xffEntries };
    }

    const firstForwarded = normaliseClientIp(forwarded[0]);
    if (firstForwarded !== null) {
      return { ip: firstForwarded, source: 'x-forwarded-for', xffEntries };
    }
  }

  const socketAddress = normaliseClientIp(request.socket?.remoteAddress);
  if (socketAddress !== null) {
    return { ip: socketAddress, source: 'socket', xffEntries };
  }

  const platformAddress = normaliseClientIp(request.ip);
  if (platformAddress !== null) {
    return { ip: platformAddress, source: 'socket', xffEntries };
  }

  return { ip: UNKNOWN_TRUSTED_IP, source: 'unknown', xffEntries };
}

/**
 * Resolve the address used as the `EDGE_IP` rate-limit subject.
 *
 * Thin wrapper over `resolveClientIp`; the value is the same and no address is
 * logged here.
 */
export function trustedIp(request: TrustedIpRequest): string {
  return resolveClientIp(request).ip;
}

function splitForwardedEntries(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Trim, strip a port or IPv6 zone, lowercase IPv6, then accept only a globally
 * routable address. Returns `null` for anything else.
 */
function normaliseClientIp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  let candidate = value.trim();
  if (candidate.length === 0) return null;

  // `[2001:db8::1]:443` and `[2001:db8::1]`.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate);
  if (bracketed?.[1]) {
    candidate = bracketed[1];
  } else {
    // `1.2.3.4:5678` (IPv4 has no other colon).
    const colon = candidate.lastIndexOf(':');
    if (colon !== -1 && candidate.indexOf(':') === colon) {
      const host = candidate.slice(0, colon);
      const port = candidate.slice(colon + 1);
      if (/^\d+$/.test(port) && isIP(host) === 4) {
        candidate = host;
      }
    }
  }

  // An IPv6 zone id is not part of the address.
  const zone = candidate.indexOf('%');
  if (zone !== -1) {
    const withoutZone = candidate.slice(0, zone);
    if (isIP(withoutZone) === 6) {
      candidate = withoutZone;
    }
  }

  const version = isIP(candidate);
  if (version === 0) return null;
  if (version === 6) candidate = candidate.toLowerCase();

  return isGloballyRoutable(candidate, version) ? candidate : null;
}

function isGloballyRoutable(address: string, version: number): boolean {
  if (version === 4) return isGloballyRoutableIpv4(address);

  const hextets = ipv6Hextets(address);
  if (hextets === null) return false;

  // `::` and `::1`.
  if (hextets.every((hextet) => hextet === 0)) return false;
  if (hextets.slice(0, 7).every((hextet) => hextet === 0) && hextets[7] === 1) {
    return false;
  }

  const first = hextets[0] ?? 0;
  // `fc00::/7` unique-local.
  if ((first & 0xfe00) === 0xfc00) return false;
  // `fe80::/10` link-local.
  if ((first & 0xffc0) === 0xfe80) return false;
  // `ff00::/8` multicast.
  if ((first & 0xff00) === 0xff00) return false;

  // `::a.b.c.d` is the deprecated IPv4-compatible range, not a global
  // destination. `::` and `::1` were handled above.
  if (hextets.slice(0, 6).every((hextet) => hextet === 0)) return false;

  // `::ffff:a.b.c.d` carries an IPv4 address; classify that address.
  if (
    hextets.slice(0, 5).every((hextet) => hextet === 0) &&
    hextets[5] === 0xffff
  ) {
    const high = hextets[6] ?? 0;
    const low = hextets[7] ?? 0;
    return isGloballyRoutableIpv4(
      `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
    );
  }

  return true;
}

function isGloballyRoutableIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  if (a === undefined || b === undefined) return false;

  if (a === 10) return false; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12
  if (a === 192 && b === 168) return false; // 192.168/16
  if (a === 127) return false; // 127/8
  if (a === 169 && b === 254) return false; // 169.254/16
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64/10 CGNAT
  if (a === 0) return false; // 0/8
  if (a >= 224 && a <= 239) return false; // 224/4 multicast
  if (a >= 240) return false; // 240/4 reserved and 255.255.255.255 broadcast

  return true;
}

/** Expand an IPv6 address into eight 16-bit hextets, or `null`. */
function ipv6Hextets(address: string): number[] | null {
  let expanded = address;

  // Fold an embedded dotted-quad tail into two hextets.
  const lastColon = expanded.lastIndexOf(':');
  const tail = expanded.slice(lastColon + 1);
  if (tail.includes('.')) {
    const octets = tail.split('.').map(Number);
    if (
      octets.length !== 4 ||
      octets.some(
        (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255
      )
    ) {
      return null;
    }
    const high = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
    const low = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
    expanded = `${expanded.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = expanded.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tailParts =
    halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  if (halves.length === 2) {
    const missing = 8 - head.length - tailParts.length;
    if (missing < 1) return null;
    const parts = [
      ...head,
      ...Array.from({ length: missing }, () => '0'),
      ...tailParts,
    ];
    const hextets = parts.map((part) => parseInt(part, 16));
    return hextets.some((hextet) => Number.isNaN(hextet)) ? null : hextets;
  }

  if (head.length !== 8) return null;
  const hextets = head.map((part) => parseInt(part, 16));
  return hextets.some((hextet) => Number.isNaN(hextet)) ? null : hextets;
}
