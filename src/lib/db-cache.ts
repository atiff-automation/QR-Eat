/**
 * PostgreSQL-Based Distributed Cache Service
 * Provides shared caching across multiple Railway instances
 *
 * @see CLAUDE.md - Type Safety, Error Handling, DRY Principle
 * @see claudedocs/CODING_STANDARDS.md - No Hardcoding, Single Source of Truth
 * @see claudedocs/DB-CACHE-IMPLEMENTATION-PLAN.md - Phase 2: Core Implementation
 *
 * Purpose: Replace in-memory cache with database-backed distributed cache
 * Benefits:
 * - Works across multiple Node.js processes/instances
 * - Persists across server restarts
 * - Shared cache for horizontal scaling
 * - Zero additional infrastructure cost
 *
 * Architecture:
 * - Uses PostgreSQL JSONB for efficient storage
 * - Implements cache-aside pattern with getOrSet
 * - Automatic expiration cleanup via cron job
 * - Graceful degradation on errors
 */

import { prisma } from './database';
import {
  CacheKeySchema,
  CacheValueSchema,
  CacheTTLSchema,
  type CacheKey,
  type CacheValue,
  type CacheTTL,
  type CacheStats,
} from './cache-schemas';
import { CACHE_ERRORS, CACHE_DEFAULTS } from './cache-constants';

/**
 * PostgreSQL-based distributed cache
 * All methods are static for easy use throughout the application
 */
export class DBCache {
  /**
   * Get cached value by key
   * Returns null if not found or expired
   *
   * @param key - Cache key (validated with Zod)
   * @returns Cached value or null
   *
   * @example
   * const tenant = await DBCache.get<ResolvedTenant>('tenant:burger-palace');
   * if (tenant) {
   *   console.log('Cache hit:', tenant.name);
   * } else {
   *   console.log('Cache miss');
   * }
   */
  static async get<T = CacheValue>(key: CacheKey): Promise<T | null> {
    try {
      // Validate input with Zod schema
      const validatedKey = CacheKeySchema.parse(key);

      // Query cache entry from database
      const entry = await prisma.cacheEntry.findUnique({
        where: { key: validatedKey },
      });

      // Cache miss
      if (!entry) {
        return null;
      }

      // Check expiration
      if (entry.expiresAt < new Date()) {
        // Expired - delete asynchronously (don't wait)
        this.delete(validatedKey).catch(() => {
          // Fail gracefully - deletion is cleanup optimization
        });
        return null;
      }

      // Validate cached value with Zod schema
      const validatedValue = CacheValueSchema.parse(entry.value);
      return validatedValue as T;
    } catch (error) {
      // Log error in development mode only
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.GET_FAILED}:`, error);
      }
      // Fail gracefully - return null on error
      return null;
    }
  }

  /**
   * Set cache value with TTL
   * Creates new entry or updates existing one
   *
   * @param key - Cache key (validated with Zod)
   * @param value - Value to cache (must be JSON-serializable)
   * @param ttlSeconds - Time to live in seconds (default: 300)
   *
   * @example
   * await DBCache.set('tenant:burger-palace', { name: 'Burger Palace' }, 300);
   */
  static async set<T = CacheValue>(
    key: CacheKey,
    value: T,
    ttlSeconds: CacheTTL = CACHE_DEFAULTS.DEFAULT_TTL
  ): Promise<void> {
    try {
      // Validate all inputs with Zod schemas
      const validatedKey = CacheKeySchema.parse(key);
      const validatedValue = CacheValueSchema.parse(value);
      const validatedTTL = CacheTTLSchema.parse(ttlSeconds);

      // Calculate expiration timestamp
      const expiresAt = new Date(Date.now() + validatedTTL * 1000);

      // Upsert cache entry (insert or update)
      await prisma.cacheEntry.upsert({
        where: { key: validatedKey },
        create: {
          key: validatedKey,
          value: validatedValue as never, // Type assertion for Prisma JSONB
          expiresAt,
        },
        update: {
          value: validatedValue as never, // Type assertion for Prisma JSONB
          expiresAt,
        },
      });
    } catch (error) {
      // Log error in development mode only
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.SET_FAILED}:`, error);
      }
      // Fail gracefully - don't throw on cache set failure
      // This ensures cache failures don't break the application
    }
  }

  /**
   * Delete one or more cache entries
   *
   * @param keys - Cache keys to delete
   *
   * @example
   * await DBCache.delete('tenant:burger-palace');
   * await DBCache.delete('tenant:pizza-place', 'tenant:sushi-bar');
   */
  static async delete(...keys: CacheKey[]): Promise<void> {
    try {
      // Validate all keys with Zod schema
      const validatedKeys = keys.map((key) => CacheKeySchema.parse(key));

      // Delete all matching cache entries
      await prisma.cacheEntry.deleteMany({
        where: {
          key: {
            in: validatedKeys,
          },
        },
      });
    } catch (error) {
      // Log error in development mode only
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.DELETE_FAILED}:`, error);
      }
      // Fail gracefully - deletion failure is not critical
    }
  }

  /**
   * Get or set pattern (cache-aside strategy)
   * Automatically fetches and caches value if not found
   *
   * @param key - Cache key
   * @param fetchFn - Function to fetch value if not cached
   * @param ttlSeconds - Time to live in seconds
   * @returns Cached or fetched value
   *
   * @example
   * const tenant = await DBCache.getOrSet(
   *   'tenant:burger-palace',
   *   async () => {
   *     return await prisma.restaurant.findUnique({
   *       where: { slug: 'burger-palace' }
   *     });
   *   },
   *   300
   * );
   */
  static async getOrSet<T = CacheValue>(
    key: CacheKey,
    fetchFn: () => Promise<T>,
    ttlSeconds: CacheTTL = CACHE_DEFAULTS.DEFAULT_TTL
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from source
    const value = await fetchFn();

    // Store in cache asynchronously (don't wait)
    // This ensures cache failures don't slow down the response
    this.set(key, value, ttlSeconds).catch(() => {
      // Fail gracefully - caching is an optimization
    });

    return value;
  }

  /**
   * Clear expired cache entries
   * Should be run periodically via cron job
   *
   * @returns Number of entries deleted
   *
   * @example
   * const deletedCount = await DBCache.clearExpired();
   * console.log(`Deleted ${deletedCount} expired cache entries`);
   */
  static async clearExpired(): Promise<number> {
    try {
      const result = await prisma.cacheEntry.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      return result.count;
    } catch (error) {
      // Log error in development mode only
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.CLEANUP_FAILED}:`, error);
      }
      return 0;
    }
  }

  /**
   * Clear all cache entries (dangerous - use with caution)
   * Only use for testing or emergency cache invalidation
   *
   * @returns Number of entries deleted
   *
   * @example
   * // Only in tests or emergency situations
   * const deletedCount = await DBCache.clearAll();
   */
  static async clearAll(): Promise<number> {
    try {
      const result = await prisma.cacheEntry.deleteMany();
      return result.count;
    } catch (error) {
      // Log error in development mode only
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.CLEANUP_FAILED}:`, error);
      }
      return 0;
    }
  }

  /**
   * Get cache statistics
   * Useful for monitoring and debugging
   *
   * @returns Cache statistics object
   *
   * @example
   * const stats = await DBCache.getStats();
   * console.log(`Total entries: ${stats.totalEntries}`);
   * console.log(`Expired entries: ${stats.expiredEntries}`);
   */
  static async getStats(): Promise<CacheStats> {
    try {
      const [total, expired] = await Promise.all([
        prisma.cacheEntry.count(),
        prisma.cacheEntry.count({
          where: {
            expiresAt: {
              lt: new Date(),
            },
          },
        }),
      ]);

      return {
        totalEntries: total,
        expiredEntries: expired,
        enabled: CACHE_DEFAULTS.ENABLED,
      };
    } catch {
      // Return safe defaults on error
      return {
        totalEntries: 0,
        expiredEntries: 0,
        enabled: false,
      };
    }
  }

  /**
   * Check if a key exists in cache (without retrieving value)
   *
   * @param key - Cache key to check
   * @returns True if key exists and is not expired
   *
   * @example
   * if (await DBCache.exists('tenant:burger-palace')) {
   *   console.log('Tenant is cached');
   * }
   */
  static async exists(key: CacheKey): Promise<boolean> {
    try {
      const validatedKey = CacheKeySchema.parse(key);

      const entry = await prisma.cacheEntry.findUnique({
        where: { key: validatedKey },
        select: { expiresAt: true },
      });

      if (!entry) {
        return false;
      }

      // Check if expired
      if (entry.expiresAt < new Date()) {
        // Cleanup expired entry asynchronously
        this.delete(validatedKey).catch(() => {});
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get remaining TTL for a cache key (in seconds)
   *
   * @param key - Cache key
   * @returns Remaining TTL in seconds, or null if key doesn't exist
   *
   * @example
   * const ttl = await DBCache.getTTL('tenant:burger-palace');
   * if (ttl) {
   *   console.log(`Cache expires in ${ttl} seconds`);
   * }
   */
  static async getTTL(key: CacheKey): Promise<number | null> {
    try {
      const validatedKey = CacheKeySchema.parse(key);

      const entry = await prisma.cacheEntry.findUnique({
        where: { key: validatedKey },
        select: { expiresAt: true },
      });

      if (!entry) {
        return null;
      }

      const now = new Date();
      if (entry.expiresAt < now) {
        // Expired - cleanup asynchronously
        this.delete(validatedKey).catch(() => {});
        return null;
      }

      // Calculate remaining TTL in seconds
      const remainingMs = entry.expiresAt.getTime() - now.getTime();
      return Math.floor(remainingMs / 1000);
    } catch {
      return null;
    }
  }

  /**
   * Update TTL for existing cache entry without modifying value
   *
   * @param key - Cache key
   * @param ttlSeconds - New TTL in seconds
   *
   * @example
   * await DBCache.updateTTL('tenant:burger-palace', 600); // Extend to 10 minutes
   */
  static async updateTTL(key: CacheKey, ttlSeconds: CacheTTL): Promise<void> {
    try {
      const validatedKey = CacheKeySchema.parse(key);
      const validatedTTL = CacheTTLSchema.parse(ttlSeconds);

      const expiresAt = new Date(Date.now() + validatedTTL * 1000);

      await prisma.cacheEntry.updateMany({
        where: { key: validatedKey },
        data: { expiresAt },
      });
    } catch (error) {
      // Fail gracefully
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update TTL:', error);
      }
    }
  }
}
