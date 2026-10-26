import { revalidateTag, unstable_cache } from 'next/cache';

/**
 * Menu responses are cached only at the server/data layer. The public HTTP
 * response must not be cached by a browser, proxy or service worker while item
 * availability is changing during service.
 */
export const MENU_CACHE_REVALIDATE_SECONDS = 30;

export function menuCacheTags(restaurantId: string): string[] {
  return ['menu', `menu-${restaurantId}`];
}

export function getCachedPublicMenu<T>(
  restaurantId: string,
  load: () => Promise<T>
): Promise<T> {
  return unstable_cache(load, ['public-menu', restaurantId], {
    revalidate: MENU_CACHE_REVALIDATE_SECONDS,
    tags: menuCacheTags(restaurantId),
  })();
}

/**
 * Best-effort invalidation. The caller must not fail an availability write if
 * the cache layer is temporarily unavailable; the short TTL is the fallback.
 */
export function invalidateMenuCache(restaurantId: string): void {
  try {
    revalidateTag('menu');
    revalidateTag(`menu-${restaurantId}`);
  } catch (error) {
    console.error('[MenuCache] Failed to invalidate menu cache:', error);
  }
}
