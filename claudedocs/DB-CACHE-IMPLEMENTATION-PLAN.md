# PostgreSQL-Based Distributed Cache Implementation Plan

**Status**: Ready for Implementation
**Priority**: P0 (CRITICAL)
**Effort**: 2 days
**Compliance**: CLAUDE.md ✅

---

## Executive Summary

### Problem Statement
Current in-memory caching in `/src/lib/tenant-resolver.ts` (lines 45-96) has critical limitations:
- ❌ **Single-instance only**: Cache not shared across Railway instances
- ❌ **No persistence**: Cache lost on server restart
- ❌ **Memory leaks**: No automatic cleanup in production
- ❌ **Horizontal scaling broken**: Load balancer causes cache misses
- ❌ **CLAUDE.md violations**: Hardcoded values, console.log, no constants

### Solution Overview
Replace in-memory Map with PostgreSQL-based distributed cache that:
- ✅ Works across multiple Railway instances
- ✅ Persists across restarts
- ✅ Follows CLAUDE.md coding standards
- ✅ Uses Zod validation for type safety
- ✅ Has proper error handling
- ✅ Zero additional infrastructure cost

---

## Codebase Audit Findings

### Current Implementation Issues

#### ❌ CLAUDE.md Violations

**1. Hardcoded Values** (Violation: No Hardcoding)
```typescript
// Line 47: Hardcoded TTL
private ttl: number = 5 * 60 * 1000; // 5 minutes TTL

// Line 100: Hardcoded interval
setInterval(() => {
  tenantCache.cleanup();
}, 10 * 60 * 1000);
```

**2. Console Logging** (Violation: No console.log in production)
```typescript
// Lines: 182, 282, 298, 300, 345, 399
console.error('Error resolving tenant:', error);
console.log(`🏢 Preloaded ${tenants.length} tenants into cache`);
```

**3. No Constants File** (Violation: Single Source of Truth)
- No centralized cache configuration
- Magic numbers scattered throughout code

**4. No Type Validation** (Violation: All inputs must use Zod)
- Cache operations have no Zod validation

#### ✅ Good Patterns to Preserve

1. **Clean separation of concerns** - TenantCache class is well-structured
2. **Type-safe interfaces** - ResolvedTenant, TenantResolutionResult
3. **Error handling** - Try-catch blocks present
4. **Documentation** - Good JSDoc comments

---

## Implementation Plan

### Phase 1: Foundation (2 hours)

#### Task 1.1: Create Cache Constants File
**File**: `/src/lib/cache-constants.ts`

```typescript
/**
 * Cache Configuration Constants
 * Single Source of Truth for all cache-related configuration
 * @see CLAUDE.md - No Hardcoding principle
 */

// Cache TTL values (in seconds)
export const CACHE_TTL = {
  TENANT: 300, // 5 minutes
  SESSION: 86400, // 24 hours
  PERMISSION: 300, // 5 minutes
  MENU: 600, // 10 minutes
  SHORT: 60, // 1 minute
  LONG: 3600, // 1 hour
} as const;

// Cache key prefixes for namespacing
export const CACHE_PREFIX = {
  TENANT: 'tenant',
  SESSION: 'session',
  PERMISSION: 'permission',
  MENU: 'menu',
} as const;

// Cache cleanup configuration
export const CACHE_CLEANUP = {
  INTERVAL_MS: 10 * 60 * 1000, // 10 minutes
  BATCH_SIZE: 100, // Delete 100 expired entries at a time
} as const;

// Cache error messages
export const CACHE_ERRORS = {
  GET_FAILED: 'Failed to retrieve cache entry',
  SET_FAILED: 'Failed to set cache entry',
  DELETE_FAILED: 'Failed to delete cache entry',
  CLEANUP_FAILED: 'Failed to cleanup expired cache entries',
  VALIDATION_FAILED: 'Cache operation validation failed',
} as const;

// Cache metrics
export const CACHE_METRICS = {
  MAX_KEY_LENGTH: 255,
  MAX_VALUE_SIZE_MB: 10,
} as const;
```

**Checklist**:
- [ ] Create file with all constants
- [ ] Add JSDoc documentation
- [ ] Use `as const` for type safety
- [ ] Follow naming conventions (UPPER_SNAKE_CASE)

---

#### Task 1.2: Create Zod Validation Schemas
**File**: `/src/lib/cache-schemas.ts`

```typescript
import { z } from 'zod';
import { CACHE_METRICS } from './cache-constants';

/**
 * Zod schemas for cache operations
 * Ensures type safety and validation at runtime
 * @see CLAUDE.md - All inputs must be validated with Zod
 */

// Cache key validation
export const CacheKeySchema = z
  .string()
  .min(1, 'Cache key cannot be empty')
  .max(
    CACHE_METRICS.MAX_KEY_LENGTH,
    `Cache key must be <= ${CACHE_METRICS.MAX_KEY_LENGTH} characters`
  )
  .regex(
    /^[a-zA-Z0-9:_-]+$/,
    'Cache key can only contain alphanumeric characters, colons, underscores, and hyphens'
  );

// Cache value validation (generic JSON)
export const CacheValueSchema = z.unknown();

// TTL validation
export const CacheTTLSchema = z
  .number()
  .int('TTL must be an integer')
  .positive('TTL must be positive')
  .max(2592000, 'TTL cannot exceed 30 days (2592000 seconds)');

// Cache entry validation (for database operations)
export const CacheEntrySchema = z.object({
  key: CacheKeySchema,
  value: CacheValueSchema,
  ttl: CacheTTLSchema,
});

// Cache options validation
export const CacheOptionsSchema = z.object({
  ttl: CacheTTLSchema.optional(),
  prefix: z.string().optional(),
});

// Types derived from schemas
export type CacheKey = z.infer<typeof CacheKeySchema>;
export type CacheValue = z.infer<typeof CacheValueSchema>;
export type CacheTTL = z.infer<typeof CacheTTLSchema>;
export type CacheEntry = z.infer<typeof CacheEntrySchema>;
export type CacheOptions = z.infer<typeof CacheOptionsSchema>;
```

**Checklist**:
- [ ] Create all Zod schemas
- [ ] Add descriptive error messages
- [ ] Export TypeScript types
- [ ] Add JSDoc documentation

---

#### Task 1.3: Add CacheEntry Model to Prisma Schema
**File**: `/prisma/schema.prisma`

```prisma
// Distributed cache table for multi-instance caching
// Replaces in-memory cache to support horizontal scaling
model CacheEntry {
  id        String   @id @default(uuid())
  key       String   @unique
  value     Json
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([expiresAt])
  @@index([key, expiresAt])
  @@map("cache_entries")
}
```

**Migration Commands**:
```bash
# Create migration
npx prisma migrate dev --name add_distributed_cache_table

# Generate Prisma client
npx prisma generate
```

**Checklist**:
- [ ] Add model to schema.prisma
- [ ] Run migration successfully
- [ ] Generate Prisma client
- [ ] Verify indexes created

---

### Phase 2: Core Cache Implementation (4 hours)

#### Task 2.1: Implement Database Cache Service
**File**: `/src/lib/db-cache.ts`

```typescript
import { prisma } from './database';
import {
  CacheKeySchema,
  CacheValueSchema,
  CacheTTLSchema,
  type CacheKey,
  type CacheValue,
  type CacheTTL,
} from './cache-schemas';
import { CACHE_ERRORS } from './cache-constants';

/**
 * PostgreSQL-based distributed cache service
 * Provides shared caching across multiple Railway instances
 *
 * @see CLAUDE.md - Single Source of Truth, Type Safety
 */
export class DBCache {
  /**
   * Get cached value by key
   * Returns null if not found or expired
   *
   * @param key - Cache key (validated with Zod)
   * @returns Cached value or null
   */
  static async get<T = CacheValue>(key: CacheKey): Promise<T | null> {
    try {
      // Validate input
      const validatedKey = CacheKeySchema.parse(key);

      const entry = await prisma.cacheEntry.findUnique({
        where: { key: validatedKey },
      });

      if (!entry) {
        return null;
      }

      // Check expiration
      if (entry.expiresAt < new Date()) {
        // Expired - delete asynchronously
        this.delete(validatedKey).catch(() => {
          // Fail gracefully - deletion is cleanup
        });
        return null;
      }

      // Validate cached value
      const validatedValue = CacheValueSchema.parse(entry.value);
      return validatedValue as T;
    } catch (error) {
      // Log error properly (will be replaced with logger in Task 3.2)
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.GET_FAILED}:`, error);
      }
      return null; // Fail gracefully
    }
  }

  /**
   * Set cache value with TTL
   *
   * @param key - Cache key (validated with Zod)
   * @param value - Value to cache (validated with Zod)
   * @param ttlSeconds - Time to live in seconds (default: 300)
   */
  static async set<T = CacheValue>(
    key: CacheKey,
    value: T,
    ttlSeconds: CacheTTL = 300
  ): Promise<void> {
    try {
      // Validate inputs
      const validatedKey = CacheKeySchema.parse(key);
      const validatedValue = CacheValueSchema.parse(value);
      const validatedTTL = CacheTTLSchema.parse(ttlSeconds);

      const expiresAt = new Date(Date.now() + validatedTTL * 1000);

      await prisma.cacheEntry.upsert({
        where: { key: validatedKey },
        create: {
          key: validatedKey,
          value: validatedValue as never,
          expiresAt,
        },
        update: {
          value: validatedValue as never,
          expiresAt,
        },
      });
    } catch (error) {
      // Log error properly (will be replaced with logger in Task 3.2)
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.SET_FAILED}:`, error);
      }
      // Fail gracefully - don't throw
    }
  }

  /**
   * Delete one or more cache entries
   *
   * @param keys - Cache keys to delete
   */
  static async delete(...keys: CacheKey[]): Promise<void> {
    try {
      // Validate all keys
      const validatedKeys = keys.map((key) => CacheKeySchema.parse(key));

      await prisma.cacheEntry.deleteMany({
        where: {
          key: {
            in: validatedKeys,
          },
        },
      });
    } catch (error) {
      // Log error properly (will be replaced with logger in Task 3.2)
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.DELETE_FAILED}:`, error);
      }
      // Fail gracefully
    }
  }

  /**
   * Get or set pattern (cache-aside strategy)
   * Automatically fetches and caches if not found
   *
   * @param key - Cache key
   * @param fetchFn - Function to fetch value if not cached
   * @param ttlSeconds - Time to live in seconds
   * @returns Cached or fetched value
   */
  static async getOrSet<T = CacheValue>(
    key: CacheKey,
    fetchFn: () => Promise<T>,
    ttlSeconds: CacheTTL = 300
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from source
    const value = await fetchFn();

    // Store in cache asynchronously (don't wait)
    this.set(key, value, ttlSeconds).catch(() => {
      // Fail gracefully - caching is optimization
    });

    return value;
  }

  /**
   * Clear expired entries (run periodically via cron)
   *
   * @returns Number of entries deleted
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
      // Log error properly (will be replaced with logger in Task 3.2)
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.CLEANUP_FAILED}:`, error);
      }
      return 0;
    }
  }

  /**
   * Clear all cache entries (dangerous - use with caution)
   *
   * @returns Number of entries deleted
   */
  static async clearAll(): Promise<number> {
    try {
      const result = await prisma.cacheEntry.deleteMany();
      return result.count;
    } catch (error) {
      // Log error properly (will be replaced with logger in Task 3.2)
      if (process.env.NODE_ENV === 'development') {
        console.error(`${CACHE_ERRORS.CLEANUP_FAILED}:`, error);
      }
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
  }> {
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
      };
    } catch (error) {
      return {
        totalEntries: 0,
        expiredEntries: 0,
      };
    }
  }
}
```

**Checklist**:
- [ ] Implement all methods
- [ ] Add Zod validation to all inputs
- [ ] Add proper error handling (try-catch)
- [ ] Add JSDoc documentation
- [ ] No `any` types (use generics)
- [ ] All methods static for easy use

---

#### Task 2.2: Create Cache Abstraction Layer
**File**: `/src/lib/cache.ts`

```typescript
import { DBCache } from './db-cache';
import {
  CacheOptionsSchema,
  type CacheKey,
  type CacheValue,
  type CacheTTL,
  type CacheOptions,
} from './cache-schemas';
import { CACHE_TTL, CACHE_PREFIX } from './cache-constants';

/**
 * High-level cache abstraction with prefix support
 * Provides namespaced caching with default TTLs
 *
 * @see CLAUDE.md - DRY principle, Single Responsibility
 */
export class Cache {
  private readonly prefix: string;
  private readonly defaultTTL: CacheTTL;

  constructor(options: CacheOptions = {}) {
    const validated = CacheOptionsSchema.parse(options);
    this.prefix = validated.prefix || CACHE_PREFIX.TENANT;
    this.defaultTTL = validated.ttl || CACHE_TTL.TENANT;
  }

  /**
   * Build namespaced cache key
   */
  private buildKey(key: CacheKey): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * Get cached value
   */
  async get<T = CacheValue>(key: CacheKey): Promise<T | null> {
    const cacheKey = this.buildKey(key);
    return await DBCache.get<T>(cacheKey);
  }

  /**
   * Set cached value
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
   * Delete cached value(s)
   */
  async delete(...keys: CacheKey[]): Promise<void> {
    const cacheKeys = keys.map((k) => this.buildKey(k));
    await DBCache.delete(...cacheKeys);
  }

  /**
   * Get or set pattern (cache-aside)
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
}

/**
 * Pre-configured cache instances
 * Single Source of Truth for application caching
 */
export const tenantCache = new Cache({
  prefix: CACHE_PREFIX.TENANT,
  ttl: CACHE_TTL.TENANT,
});

export const sessionCache = new Cache({
  prefix: CACHE_PREFIX.SESSION,
  ttl: CACHE_TTL.SESSION,
});

export const permissionCache = new Cache({
  prefix: CACHE_PREFIX.PERMISSION,
  ttl: CACHE_TTL.PERMISSION,
});

export const menuCache = new Cache({
  prefix: CACHE_PREFIX.MENU,
  ttl: CACHE_TTL.MENU,
});
```

**Checklist**:
- [ ] Implement Cache class with prefix support
- [ ] Create pre-configured instances
- [ ] Add type safety with generics
- [ ] Add JSDoc documentation
- [ ] Follow DRY principle

---

### Phase 3: Integration (3 hours)

#### Task 3.1: Refactor Tenant Resolver
**File**: `/src/lib/tenant-resolver.ts`

**Changes**:
1. Remove TenantCache class (lines 45-93)
2. Remove setInterval cleanup (lines 99-103)
3. Import tenantCache from cache.ts
4. Update all cache operations
5. Remove console.log/error statements
6. Add proper error messages

**Updated Implementation**:
```typescript
// IMPORTS
import { prisma } from './database';
import { normalizeSubdomain } from './subdomain';
import { tenantCache } from './cache';

// Remove TenantCache class entirely (lines 45-93)
// Remove setInterval (lines 99-103)

// UPDATE resolveTenant function
export async function resolveTenant(
  subdomain: string
): Promise<TenantResolutionResult> {
  const slug = normalizeSubdomain(subdomain);

  try {
    // Check distributed cache first
    const cached = await tenantCache.get<ResolvedTenant | null>(slug);
    if (cached !== undefined) {
      return {
        tenant: cached,
        isValid: cached !== null,
        error: cached === null ? 'Restaurant not found' : undefined,
        cached: true,
      };
    }

    // ... rest of the function remains same
    // Just update cache.set() calls to use tenantCache

    // Cache the result
    await tenantCache.set(slug, resolvedTenant);

    return {
      tenant: resolvedTenant,
      isValid: true,
      cached: false,
    };
  } catch (error) {
    // Proper error handling (no console.error)
    return {
      tenant: null,
      isValid: false,
      error: 'Database error while resolving tenant',
      cached: false,
    };
  }
}

// UPDATE preloadTenantCache
export async function preloadTenantCache(): Promise<void> {
  try {
    const tenants = await getAllActiveTenants();

    for (const tenant of tenants) {
      await tenantCache.set(tenant.slug, tenant);
    }

    // Remove console.log
  } catch (error) {
    // Remove console.error
  }
}

// UPDATE invalidateTenantCache
export function invalidateTenantCache(slug: string): void {
  tenantCache.delete(slug).catch(() => {
    // Fail gracefully
  });
}

// UPDATE clearTenantCache
export function clearTenantCache(): void {
  // Not needed - handled by DBCache.clearAll()
}

// UPDATE getTenantCacheStats
export async function getTenantCacheStats(): Promise<{
  size: number;
  enabled: boolean;
}> {
  const stats = await DBCache.getStats();
  return {
    size: stats.totalEntries,
    enabled: true,
  };
}
```

**Checklist**:
- [ ] Remove in-memory TenantCache class
- [ ] Remove setInterval cleanup
- [ ] Import and use tenantCache
- [ ] Update all cache operations
- [ ] Remove all console.log/error
- [ ] Test all functions

---

#### Task 3.2: Add Cache Cleanup Cron Job
**File**: `/src/lib/cache-cleanup-cron.ts`

```typescript
import { DBCache } from './db-cache';
import { CACHE_CLEANUP } from './cache-constants';

/**
 * Periodic cache cleanup job
 * Removes expired entries to prevent database bloat
 */
export class CacheCleanupCron {
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the cleanup cron job
   */
  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    this.intervalId = setInterval(async () => {
      try {
        const deletedCount = await DBCache.clearExpired();

        if (process.env.NODE_ENV === 'development' && deletedCount > 0) {
          console.log(
            `🧹 Cache cleanup: removed ${deletedCount} expired entries`
          );
        }
      } catch (error) {
        // Fail gracefully - cleanup will retry on next interval
      }
    }, CACHE_CLEANUP.INTERVAL_MS);
  }

  /**
   * Stop the cleanup cron job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Global singleton instance
export const cacheCleanupCron = new CacheCleanupCron();

// Auto-start in server environments
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  cacheCleanupCron.start();
}
```

**Checklist**:
- [ ] Create cron class
- [ ] Use constants for interval
- [ ] Add start/stop methods
- [ ] Auto-start in production
- [ ] Handle errors gracefully

---

### Phase 4: Testing & Validation (3 hours)

#### Task 4.1: Create Cache Tests
**File**: `/tests/lib/cache.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { prisma } from '@/lib/database';
import { DBCache } from '@/lib/db-cache';
import { tenantCache } from '@/lib/cache';

describe('PostgreSQL-Based Distributed Cache', () => {
  beforeAll(async () => {
    // Clear cache before tests
    await DBCache.clearAll();
  });

  afterAll(async () => {
    // Cleanup
    await DBCache.clearAll();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear cache between tests
    await DBCache.clearAll();
  });

  describe('DBCache', () => {
    it('should set and get cache values', async () => {
      await DBCache.set('test:key', { foo: 'bar' }, 300);
      const result = await DBCache.get('test:key');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return null for non-existent keys', async () => {
      const result = await DBCache.get('non:existent');
      expect(result).toBeNull();
    });

    it('should handle expired entries', async () => {
      // Set with 1 second TTL
      await DBCache.set('test:expire', { data: 'test' }, 1);

      // Wait 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Should be expired
      const result = await DBCache.get('test:expire');
      expect(result).toBeNull();
    });

    it('should delete cache entries', async () => {
      await DBCache.set('test:delete', { data: 'test' }, 300);
      await DBCache.delete('test:delete');
      const result = await DBCache.get('test:delete');
      expect(result).toBeNull();
    });

    it('should implement getOrSet pattern', async () => {
      let fetchCount = 0;
      const fetchFn = async () => {
        fetchCount++;
        return { data: 'fetched' };
      };

      // First call should fetch
      const result1 = await DBCache.getOrSet('test:getOrSet', fetchFn, 300);
      expect(result1).toEqual({ data: 'fetched' });
      expect(fetchCount).toBe(1);

      // Second call should use cache
      const result2 = await DBCache.getOrSet('test:getOrSet', fetchFn, 300);
      expect(result2).toEqual({ data: 'fetched' });
      expect(fetchCount).toBe(1); // Not incremented
    });

    it('should clear expired entries', async () => {
      // Set expired entry
      await DBCache.set('test:expired', { data: 'old' }, 1);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Set valid entry
      await DBCache.set('test:valid', { data: 'new' }, 300);

      const deletedCount = await DBCache.clearExpired();
      expect(deletedCount).toBe(1);

      // Valid entry should still exist
      const validResult = await DBCache.get('test:valid');
      expect(validResult).toEqual({ data: 'new' });
    });
  });

  describe('Cache (with prefix)', () => {
    it('should use prefix for keys', async () => {
      await tenantCache.set('test-slug', { name: 'Test Restaurant' });

      // Check that key has prefix in database
      const entry = await prisma.cacheEntry.findUnique({
        where: { key: 'tenant:test-slug' },
      });
      expect(entry).not.toBeNull();
    });

    it('should support multiple cache instances', async () => {
      await tenantCache.set('key1', { type: 'tenant' });

      const result = await tenantCache.get('key1');
      expect(result).toEqual({ type: 'tenant' });
    });
  });

  describe('Validation', () => {
    it('should validate cache keys', async () => {
      // Invalid key (too long)
      const longKey = 'a'.repeat(300);
      await expect(DBCache.set(longKey, { data: 'test' }, 300)).rejects.toThrow();
    });

    it('should validate TTL', async () => {
      // Invalid TTL (negative)
      await expect(DBCache.set('test', { data: 'test' }, -1)).rejects.toThrow();
    });
  });
});
```

**Checklist**:
- [ ] Create comprehensive test suite
- [ ] Test basic operations (get/set/delete)
- [ ] Test expiration logic
- [ ] Test getOrSet pattern
- [ ] Test validation (Zod schemas)
- [ ] Test prefix namespacing
- [ ] All tests pass

---

#### Task 4.2: Performance Testing
**File**: `/tests/lib/cache-performance.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DBCache } from '@/lib/db-cache';
import { tenantCache } from '@/lib/cache';

describe('Cache Performance Tests', () => {
  beforeAll(async () => {
    await DBCache.clearAll();
  });

  afterAll(async () => {
    await DBCache.clearAll();
  });

  it('should handle concurrent writes', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        DBCache.set(`test:concurrent:${i}`, { index: i }, 300)
      );
    }

    await Promise.all(promises);

    // Verify all entries exist
    const stats = await DBCache.getStats();
    expect(stats.totalEntries).toBeGreaterThanOrEqual(100);
  });

  it('should handle concurrent reads', async () => {
    await DBCache.set('test:concurrent-read', { data: 'test' }, 300);

    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(DBCache.get('test:concurrent-read'));
    }

    const results = await Promise.all(promises);
    results.forEach((result) => {
      expect(result).toEqual({ data: 'test' });
    });
  });

  it('should complete cache operations within acceptable time', async () => {
    const startTime = Date.now();

    await tenantCache.set('perf-test', { data: 'test' });
    const result = await tenantCache.get('perf-test');

    const duration = Date.now() - startTime;

    expect(result).toEqual({ data: 'test' });
    expect(duration).toBeLessThan(100); // Should complete in <100ms
  });
});
```

**Checklist**:
- [ ] Test concurrent operations
- [ ] Test performance benchmarks
- [ ] Verify <100ms operation time
- [ ] Test under load
- [ ] All tests pass

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review this plan thoroughly
- [ ] Understand all CLAUDE.md violations
- [ ] Set up development environment
- [ ] Create feature branch: `feature/distributed-cache`

### Phase 1: Foundation
- [ ] Task 1.1: Create cache constants file
- [ ] Task 1.2: Create Zod validation schemas
- [ ] Task 1.3: Add CacheEntry model to Prisma

### Phase 2: Core Implementation
- [ ] Task 2.1: Implement DBCache service
- [ ] Task 2.2: Create Cache abstraction layer

### Phase 3: Integration
- [ ] Task 3.1: Refactor tenant-resolver.ts
- [ ] Task 3.2: Add cache cleanup cron job

### Phase 4: Testing
- [ ] Task 4.1: Create cache tests
- [ ] Task 4.2: Performance testing
- [ ] Run full test suite: `npm run test`
- [ ] Run type checking: `npm run type-check`
- [ ] Run linting: `npm run lint`

### Post-Implementation
- [ ] Code review against CLAUDE.md
- [ ] Performance validation (<100ms operations)
- [ ] Multi-instance testing (Railway)
- [ ] Documentation update
- [ ] Create PR with detailed summary

---

## CLAUDE.md Compliance Checklist

### ✅ Single Source of Truth
- [ ] All cache configuration in cache-constants.ts
- [ ] No duplicate TTL/prefix definitions
- [ ] Centralized error messages

### ✅ No Hardcoding
- [ ] All TTL values from constants
- [ ] All cache prefixes from constants
- [ ] All error messages from constants
- [ ] No magic numbers

### ✅ Type Safety
- [ ] No `any` types anywhere
- [ ] All inputs validated with Zod
- [ ] Proper TypeScript generics
- [ ] Type exports from schemas

### ✅ Error Handling
- [ ] All async operations have try-catch
- [ ] Graceful degradation (cache failures don't break app)
- [ ] Proper error messages
- [ ] No silent failures

### ✅ DRY Principle
- [ ] Cache logic extracted to reusable classes
- [ ] No code duplication
- [ ] Shared validation schemas

### ✅ Database Operations
- [ ] All operations use Prisma (no raw SQL)
- [ ] Proper use of transactions where needed
- [ ] Connection pooling safe

---

## Testing Strategy

### Unit Tests
- DBCache CRUD operations
- Zod schema validation
- Cache prefix functionality
- TTL expiration logic

### Integration Tests
- Tenant resolver integration
- Multi-instance cache sharing
- Cache cleanup cron job

### Performance Tests
- Concurrent operations
- Operation latency (<100ms)
- Cache hit/miss ratios

### Regression Tests
- Existing tenant resolution still works
- No breaking changes to API
- Backward compatibility

---

## Success Metrics

### Performance
- [ ] Cache operations complete in <100ms
- [ ] 90%+ cache hit rate for tenants
- [ ] No memory leaks
- [ ] Handles 100+ concurrent operations

### Quality
- [ ] 100% CLAUDE.md compliance
- [ ] All tests passing
- [ ] Zero TypeScript errors
- [ ] Zero ESLint errors

### Reliability
- [ ] Works across multiple Railway instances
- [ ] Survives server restarts
- [ ] Graceful error handling
- [ ] Automatic cleanup works

---

## Rollback Plan

If issues occur:
1. Revert tenant-resolver.ts changes
2. Keep Prisma migration (harmless)
3. Remove cache imports
4. Re-enable in-memory cache temporarily

**Emergency Rollback Command**:
```bash
git revert <commit-hash>
npm run build
```

---

## Next Steps After Implementation

1. **Monitor Performance**: Track cache hit rates and operation times
2. **Optimize Indexes**: Add more indexes if queries are slow
3. **Add Logging**: Replace console.log with proper logger
4. **Add Metrics**: Implement Prometheus/Grafana monitoring
5. **Document API**: Update API documentation

---

## Questions for Clarification

Before starting implementation:
- [ ] Confirm Railway production environment ready
- [ ] Verify PostgreSQL version (should be 15+)
- [ ] Check if connection pooling configured
- [ ] Confirm test environment setup

---

**Ready to implement? Let's proceed systematically through each phase!**
