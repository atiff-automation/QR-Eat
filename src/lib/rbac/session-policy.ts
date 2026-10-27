/**
 * Pure session policy helpers. Kept separate so cap/device behaviour can be
 * tested without a database or HTTP server.
 */
export interface SessionEvictionCandidate {
  id: string;
  lastActivity: Date;
  deviceId?: string | null;
  deviceType?: string | null;
}

export function sessionsToEvict(activeCount: number, max: number): number {
  if (max < 1) return 0;
  return Math.max(0, activeCount - (max - 1));
}

/**
 * Pick sessions to remove before creating one new session.
 *
 * Rules:
 * - Never pick the incoming device; it is replaced separately.
 * - Use least-recently-active first.
 * - Remove web sessions before Counter sessions.
 * - Treat old sessions with no type as web sessions.
 */
export function selectSessionsToEvict<T extends SessionEvictionCandidate>(
  sessions: T[],
  max: number,
  incomingDeviceId?: string | null
): T[] {
  const eligible = sessions.filter(
    (session) => !incomingDeviceId || session.deviceId !== incomingDeviceId
  );
  const excess = sessionsToEvict(eligible.length, max);
  if (excess <= 0) return [];

  return [...eligible]
    .sort((left, right) => {
      const leftIsCounter = isCounterSession(left);
      const rightIsCounter = isCounterSession(right);
      if (leftIsCounter !== rightIsCounter) {
        return leftIsCounter ? 1 : -1;
      }
      return left.lastActivity.getTime() - right.lastActivity.getTime();
    })
    .slice(0, excess);
}

export function isCounterSession(session: {
  deviceType?: string | null;
}): boolean {
  return session.deviceType === 'counter';
}

export function describeDevice(userAgent?: string | null): {
  platform: string;
  browser: string;
  label: string;
} {
  const ua = userAgent || '';
  const platform = /android/i.test(ua)
    ? 'Android'
    : /iphone|ipad|ipod/i.test(ua)
      ? 'iOS'
      : /windows/i.test(ua)
        ? 'Windows'
        : /mac os|macintosh/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : 'Unknown';
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /firefox\//i.test(ua)
      ? 'Firefox'
      : /chrome\//i.test(ua) && !/edg\//i.test(ua)
        ? 'Chrome'
        : /safari\//i.test(ua) && !/chrome\//i.test(ua)
          ? 'Safari'
          : /tabtep-counter|okhttp/i.test(ua)
            ? 'Tabtep Counter'
            : 'Unknown';
  return {
    platform,
    browser,
    label: browser === 'Tabtep Counter' ? browser : `${browser} on ${platform}`,
  };
}
