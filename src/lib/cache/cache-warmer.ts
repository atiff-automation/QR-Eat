import { prisma } from '@/lib/database';
import { cacheManager } from './smart-cache-manager';

/**
 * Cache Warmer
 * Warm up cache for active restaurants
 * Run this on server startup or via cron job
 */
export async function warmupActiveRestaurants(): Promise<void> {
  try {
    // Get restaurants that had activity in last 24 hours
    const activeRestaurants = await prisma.restaurant.findMany({
      where: {
        OR: [
          {
            orders: {
              some: {
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
              },
            },
          },
          {
            expenses: {
              some: {
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    // Warm up cache for each active restaurant
    for (const restaurant of activeRestaurants) {
      await cacheManager.warmup(restaurant.id);
    }

    console.log(
      `[Cache] Warmed up ${activeRestaurants.length} active restaurants`
    );
  } catch (error) {
    console.error('[Cache] Error warming up active restaurants:', error);
  }
}

// Schedule cache warming (run every hour) in production
if (process.env.NODE_ENV === 'production') {
  setInterval(warmupActiveRestaurants, 60 * 60 * 1000);
}
