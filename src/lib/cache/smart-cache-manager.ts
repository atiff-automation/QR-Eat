import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from '@/lib/database';

/**
 * Smart Cache Manager
 * Automatically manages cache keys, invalidation, and optimization
 */

// Cache configuration by data type
const CACHE_CONFIG = {
  'expense-categories': {
    ttl: 3600, // 1 hour
    tags: ['categories'],
    priority: 'high' as const, // Rarely changes, keep longer
  },
  'expense-list': {
    ttl: 300, // 5 minutes
    tags: ['expenses'],
    priority: 'medium' as const,
  },
  'expense-summary': {
    ttl: 300, // 5 minutes
    tags: ['expenses', 'summary'],
    priority: 'high' as const, // Dashboard needs this
  },
  'profit-loss': {
    ttl: 900, // 15 minutes
    tags: ['profit-loss', 'expenses', 'orders'],
    priority: 'low' as const, // Expensive to calculate, but not frequently accessed
  },
  'monthly-totals': {
    ttl: 600, // 10 minutes
    tags: ['expenses', 'summary'],
    priority: 'high' as const,
  },
} as const;

type CacheType = keyof typeof CACHE_CONFIG;

export interface CacheInvalidationOperation {
  type:
    | 'expense-created'
    | 'expense-updated'
    | 'expense-deleted'
    | 'category-created'
    | 'category-updated'
    | 'category-deleted'
    | 'order-completed';
  restaurantId: string;
  affectedData?: unknown;
}

class SmartCacheManager {
  private static instance: SmartCacheManager;

  private constructor() {}

  static getInstance(): SmartCacheManager {
    if (!SmartCacheManager.instance) {
      SmartCacheManager.instance = new SmartCacheManager();
    }
    return SmartCacheManager.instance;
  }

  /**
   * Generate smart cache key based on parameters
   */
  private generateCacheKey(
    type: string,
    params: Record<string, unknown>
  ): string[] {
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}:${params[key]}`)
      .join('|');

    return [type, sortedParams];
  }

  /**
   * Get cached data with automatic key generation
   */
  async get<T>(
    type: CacheType,
    params: Record<string, unknown>,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const config = CACHE_CONFIG[type];
    const cacheKey = this.generateCacheKey(type, params);

    return unstable_cache(fetchFn, cacheKey, {
      revalidate: config.ttl,
      tags: config.tags,
    })();
  }

  /**
   * Invalidate cache intelligently based on operation
   */
  async invalidate(operation: CacheInvalidationOperation): Promise<void> {
    const { type, restaurantId } = operation;

    switch (type) {
      case 'expense-created':
      case 'expense-updated':
      case 'expense-deleted':
        // Invalidate expense-related caches
        revalidateTag('expenses');
        revalidateTag('summary');
        revalidateTag('profit-loss');

        // Also invalidate specific restaurant cache
        revalidateTag(`expenses-${restaurantId}`);
        break;

      case 'category-created':
      case 'category-updated':
      case 'category-deleted':
        // Only invalidate category cache
        revalidateTag('categories');
        revalidateTag(`categories-${restaurantId}`);
        break;

      case 'order-completed':
        // Only invalidate P&L (revenue changed)
        revalidateTag('profit-loss');
        break;

      default:
        // Fallback: invalidate everything for this restaurant
        revalidateTag(`restaurant-${restaurantId}`);
    }

    // Log invalidation for monitoring
    console.log(`[Cache] Invalidated: ${type} for restaurant ${restaurantId}`);
  }

  /**
   * Warm up cache for frequently accessed data
   */
  async warmup(restaurantId: string): Promise<void> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    try {
      // Pre-cache categories
      await this.get('expense-categories', { restaurantId }, async () => {
        return prisma.expenseCategory.findMany({
          where: {
            OR: [{ restaurantId }, { isSystem: true }],
          },
        });
      });

      // Pre-cache current month summary
      await this.get(
        'monthly-totals',
        { restaurantId, month: currentMonthStart.toISOString() },
        async () => {
          return prisma.expense.aggregate({
            where: {
              restaurantId,
              expenseDate: { gte: currentMonthStart },
            },
            _sum: { amount: true },
          });
        }
      );

      console.log(`[Cache] Warmed up cache for restaurant ${restaurantId}`);
    } catch (error) {
      console.error(
        `[Cache] Error warming up cache for restaurant ${restaurantId}:`,
        error
      );
    }
  }
}

// Export singleton instance
export const cacheManager = SmartCacheManager.getInstance();
