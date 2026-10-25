/**
 * Pure session policy helpers. Kept separate so cap/device behaviour can be
 * tested without a database or HTTP server.
 */
export function sessionsToEvict(activeCount: number, max: number): number {
  if (max < 1) return 0;
  return Math.max(0, activeCount - (max - 1));
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
