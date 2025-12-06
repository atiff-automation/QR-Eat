/**
 * High-Level Cache Abstraction Layer
 * Provides namespaced caching with prefix support and default TTLs
 *
 * @see CLAUDE.md - DRY Principle, Single Responsibility, Type Safety
 * @see claudedocs/CODING_STANDARDS.md - Single Source of Truth
 * @see claudedocs/DB-CACHE-IMPLEMENTATION-PLAN.md - Phase 2: Core Implementation
 *
 * Purpose: Abstract cache operations with domain-specific configurations
 * Benefits:
 * - Namespace isolation via prefixes (tenant:*, session:*, etc.)
 * - Default TTL per cache type
 * - Type-safe cache instances
 * - Simplified API for application code
 *
 * Usage:
 * - Import pre-configured cache instances (tenantCache, sessionCache, etc.)
 * - Or create custom Cache instances for specific use cases
 */

import { DBCache } from './db-cache';
import {
  CacheOptionsSchema,
  type CacheKey,
  type CacheValue,
  type CacheTTL,
  type CacheOptions,
} from './cache-schemas';
import { CACHE_TTL, CACHE_PREFIX, CACHE_DEFAULTS } from './cache-constants';

/**
 * Cache abstraction class with prefix and TTL support
 * Wraps DBCache with domain-specific configuration
 *
 * @example
 * // Create custom cache instance
 * const customCache = new Cache({ prefix: 'custom', ttl: 600 });
 * await customCache.set('key', { data: 'value' });
 * const value = await customCache.get('key');
 */
export class Cache {
  private readonly prefix: string;
  private readonly defaultTTL: CacheTTL;

  /**
   * Create a new cache instance with custom configuration
   *
   * @param options - Cache configuration options
   * @param options.prefix - Namespace prefix for all keys
   * @param options.ttl - Default TTL in seconds
   */
  constructor(options: CacheOptions = {}) {
    // Validate options with Zod schema
    const validated = CacheOptionsSchema.parse(options);

    // Set prefix and TTL with defaults
    this.prefix = validated.prefix || CACHE_DEFAULTS.DEFAULT_PREFIX;
    this.defaultTTL = validated.ttl || CACHE_DEFAULTS.DEFAULT_TTL;
  }

  /**
   * Build namespaced cache key with prefix
   * Prevents key collisions between different cache types
   *
   * @param key - Original cache key
   * @returns Prefixed cache key (e.g., "tenant:burger-palace")
   *
   * @private
   */
  private buildKey(key: CacheKey): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * Get cached value
   * Returns null if not found or expired
   *
   * @param key - Cache key (without prefix)
   * @returns Cached value or null
   *
   * @example
   * const tenant = await tenantCache.get<ResolvedTenant>('burger-palace');
   */
  async get<T = CacheValue>(key: CacheKey): Promise<T | null> {
    const cacheKey = this.buildKey(key);
    return await DBCache.get<T>(cacheKey);
  }

  /**
   * Set cached value with optional custom TTL
   *
   * @param key - Cache key (without prefix)
   * @param value - Value to cache (must be JSON-serializable)
   * @param ttl - Optional custom TTL (uses instance default if not provided)
   *
   * @example
   * await tenantCache.set('burger-palace', tenantData);
   * await tenantCache.set('burger-palace', tenantData, 600); // Custom TTL
   */
  async set<T = CacheValue>(
    key: CacheKey,
    value: T,
    ttl?: CacheTTL
  ): Promise<void> {
    const cacheKey = this.buildKey(key);
    const cacheTTL = ttl || this.defaultTTL;
    await DBCache.set(cacheKey, value, cacheTTL);
  }

  /**
   * Delete one or more cached values
   *
   * @param keys - Cache keys to delete (without prefix)
   *
   * @example
   * await tenantCache.delete('burger-palace');
   * await tenantCache.delete('burger-palace', 'pizza-place');
   */
  async delete(...keys: CacheKey[]): Promise<void> {
    const cacheKeys = keys.map((k) => this.buildKey(k));
    await DBCache.delete(...cacheKeys);
  }

  /**
   * Get or set pattern (cache-aside strategy)
   * Automatically fetches and caches value if not found
   *
   * @param key - Cache key (without prefix)
   * @param fetchFn - Function to fetch value if not cached
   * @param ttl - Optional custom TTL
   * @returns Cached or fetched value
   *
   * @example
   * const tenant = await tenantCache.getOrSet(
   *   'burger-palace',
   *   async () => {
   *     return await prisma.restaurant.findUnique({
   *       where: { slug: 'burger-palace' }
   *     });
   *   }
   * );
   */
  async getOrSet<T = CacheValue>(
    key: CacheKey,
    fetchFn: () => Promise<T>,
    ttl?: CacheTTL
  ): Promise<T> {
    const cacheKey = this.buildKey(key);
    const cacheTTL = ttl || this.defaultTTL;
    return await DBCache.getOrSet<T>(cacheKey, fetchFn, cacheTTL);
  }

  /**
   * Check if a key exists in cache
   *
   * @param key - Cache key (without prefix)
   * @returns True if key exists and is not expired
   *
   * @example
   * if (await tenantCache.exists('burger-palace')) {
   *   console.log('Tenant is cached');
   * }
   */
  async exists(key: CacheKey): Promise<boolean> {
    const cacheKey = this.buildKey(key);
    return await DBCache.exists(cacheKey);
  }

  /**
   * Get remaining TTL for a cache key
   *
   * @param key - Cache key (without prefix)
   * @returns Remaining TTL in seconds, or null if key doesn't exist
   *
   * @example
   * const ttl = await tenantCache.getTTL('burger-palace');
   * console.log(`Cache expires in ${ttl} seconds`);
   */
  async getTTL(key: CacheKey): Promise<number | null> {
    const cacheKey = this.buildKey(key);
    return await DBCache.getTTL(cacheKey);
  }

  /**
   * Update TTL for existing cache entry
   *
   * @param key - Cache key (without prefix)
   * @param ttlSeconds - New TTL in seconds
   *
   * @example
   * await tenantCache.updateTTL('burger-palace', 600);
   */
  async updateTTL(key: CacheKey, ttlSeconds: CacheTTL): Promise<void> {
    const cacheKey = this.buildKey(key);
    await DBCache.updateTTL(cacheKey, ttlSeconds);
  }

  /**
   * Get the prefix used by this cache instance
   *
   * @returns Cache prefix
   */
  getPrefix(): string {
    return this.prefix;
  }

  /**
   * Get the default TTL used by this cache instance
   *
   * @returns Default TTL in seconds
   */
  getDefaultTTL(): CacheTTL {
    return this.defaultTTL;
  }
}

// ============================================
// PRE-CONFIGURED CACHE INSTANCES
// Single Source of Truth for Application Caching
// ============================================

/**
 * Tenant/Restaurant cache
 * Used for caching restaurant resolution by subdomain
 * TTL: 5 minutes
 *
 * @example
 * const tenant = await tenantCache.get<ResolvedTenant>('burger-palace');
 */
export const tenantCache = new Cache({
  prefix: CACHE_PREFIX.TENANT,
  ttl: CACHE_TTL.TENANT,
});

/**
 * Session cache
 * Used for caching user sessions (staff, customer, admin)
 * TTL: 24 hours
 *
 * @example
 * const session = await sessionCache.get<UserSession>('session-token-123');
 */
export const sessionCache = new Cache({
  prefix: CACHE_PREFIX.SESSION,
  ttl: CACHE_TTL.SESSION,
});

/**
 * Permission cache
 * Used for caching RBAC permissions
 * TTL: 5 minutes
 *
 * @example
 * const permissions = await permissionCache.get<string[]>('user-123');
 */
export const permissionCache = new Cache({
  prefix: CACHE_PREFIX.PERMISSION,
  ttl: CACHE_TTL.PERMISSION,
});

/**
 * Menu cache
 * Used for caching menu items and categories
 * TTL: 10 minutes
 *
 * @example
 * const menu = await menuCache.get<MenuItem[]>('restaurant-123');
 */
export const menuCache = new Cache({
  prefix: CACHE_PREFIX.MENU,
  ttl: CACHE_TTL.MENU,
});

/**
 * Order cache
 * Used for caching active orders
 * TTL: 5 minutes
 *
 * @example
 * const order = await orderCache.get<Order>('order-123');
 */
export const orderCache = new Cache({
  prefix: CACHE_PREFIX.ORDER,
  ttl: CACHE_TTL.TENANT,
});

/**
 * Table cache
 * Used for caching table information and status
 * TTL: 5 minutes
 *
 * @example
 * const table = await tableCache.get<Table>('table-123');
 */
export const tableCache = new Cache({
  prefix: CACHE_PREFIX.TABLE,
  ttl: CACHE_TTL.TENANT,
});

/**
 * Staff cache
 * Used for caching staff information and permissions
 * TTL: 5 minutes
 *
 * @example
 * const staff = await staffCache.get<Staff>('staff-123');
 */
export const staffCache = new Cache({
  prefix: CACHE_PREFIX.STAFF,
  ttl: CACHE_TTL.TENANT,
});
