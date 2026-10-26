import { revalidateTag, unstable_cache } from 'next/cache';
import {
  getCachedPublicMenu,
  invalidateMenuCache,
  menuCacheTags,
  MENU_CACHE_REVALIDATE_SECONDS,
} from '@/lib/cache/menu-cache';

jest.mock('next/cache', () => ({
  revalidateTag: jest.fn(),
  unstable_cache: jest.fn((load: () => Promise<unknown>) => load),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

describe('menu cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses restaurant-scoped tags and a short revalidate window', async () => {
    const load = jest.fn().mockResolvedValue([{ id: 'menu' }]);

    await expect(getCachedPublicMenu(restaurantId, load)).resolves.toEqual([
      { id: 'menu' },
    ]);

    expect(unstable_cache).toHaveBeenCalledWith(
      load,
      ['public-menu', restaurantId],
      {
        revalidate: MENU_CACHE_REVALIDATE_SECONDS,
        tags: menuCacheTags(restaurantId),
      }
    );
  });

  it('invalidates both the global and restaurant tags', () => {
    invalidateMenuCache(restaurantId);

    expect(revalidateTag).toHaveBeenCalledWith('menu');
    expect(revalidateTag).toHaveBeenCalledWith(`menu-${restaurantId}`);
  });
});
