/**
 * Zod Validation Schemas for Cache Operations
 * Ensures type safety and runtime validation for all cache inputs
 *
 * @see CLAUDE.md - All inputs must be validated with Zod
 * @see claudedocs/CODING_STANDARDS.md - Type Safety & Quality
 *
 * Purpose: Provides runtime validation and type safety for cache operations
 * All cache operation inputs must be validated using these schemas
 */

import { z } from 'zod';
import { CACHE_METRICS, CACHE_TTL, CACHE_ERRORS } from './cache-constants';

// ============================================
// CACHE KEY VALIDATION
// ============================================

/**
 * Cache key validation schema
 *
 * Rules:
 * - Cannot be empty
 * - Maximum length: 255 characters (PostgreSQL VARCHAR limit)
 * - Only alphanumeric, colons, underscores, and hyphens allowed
 * - Format: prefix:identifier (e.g., "tenant:restaurant-slug")
 *
 * @example
 * Valid keys:
 * - "tenant:burger-palace"
 * - "session:abc-123-def-456"
 * - "menu:item_123"
 *
 * Invalid keys:
 * - "" (empty)
 * - "tenant:has spaces" (contains spaces)
 * - "tenant@invalid" (invalid characters)
 */
export const CacheKeySchema = z
  .string()
  .min(1, CACHE_ERRORS.INVALID_KEY)
  .max(
    CACHE_METRICS.MAX_KEY_LENGTH,
    `Cache key must be <= ${CACHE_METRICS.MAX_KEY_LENGTH} characters`
  )
  .regex(
    /^[a-zA-Z0-9:_-]+$/,
    'Cache key can only contain alphanumeric characters, colons, underscores, and hyphens'
  );

// ============================================
// CACHE VALUE VALIDATION
// ============================================

/**
 * Cache value validation schema
 *
 * Accepts any JSON-serializable value:
 * - Objects, arrays, strings, numbers, booleans, null
 * - Must be JSON-serializable (no functions, undefined, etc.)
 *
 * @example
 * Valid values:
 * - { name: "Restaurant", isActive: true }
 * - ["item1", "item2", "item3"]
 * - "simple string"
 * - 42
 * - null
 *
 * Invalid values:
 * - undefined
 * - () => {} (functions)
 * - Symbol()
 */
export const CacheValueSchema = z.unknown().refine(
  (value) => {
    try {
      // Test if value is JSON-serializable
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  },
  {
    message: 'Cache value must be JSON-serializable',
  }
);

// ============================================
// CACHE TTL VALIDATION
// ============================================

/**
 * Time-to-Live (TTL) validation schema
 *
 * Rules:
 * - Must be a positive integer (seconds)
 * - Minimum: 1 second
 * - Maximum: 30 days (2,592,000 seconds)
 *
 * @example
 * Valid TTL values:
 * - 60 (1 minute)
 * - 300 (5 minutes)
 * - 3600 (1 hour)
 * - 86400 (24 hours)
 *
 * Invalid TTL values:
 * - 0 (must be positive)
 * - -1 (must be positive)
 * - 3.14 (must be integer)
 * - 9999999 (exceeds maximum)
 */
export const CacheTTLSchema = z
  .number()
  .int(CACHE_ERRORS.INVALID_TTL)
  .positive(CACHE_ERRORS.INVALID_TTL)
  .max(
    CACHE_TTL.MAX_TTL,
    `TTL cannot exceed 30 days (${CACHE_TTL.MAX_TTL} seconds)`
  );

// ============================================
// CACHE ENTRY VALIDATION
// ============================================

/**
 * Complete cache entry validation schema
 *
 * Used for validating complete cache set operations
 * Ensures all components (key, value, TTL) are valid
 *
 * @example
 * const entry = {
 *   key: "tenant:burger-palace",
 *   value: { name: "Burger Palace", isActive: true },
 *   ttl: 300
 * };
 * const validated = CacheEntrySchema.parse(entry);
 */
export const CacheEntrySchema = z.object({
  key: CacheKeySchema,
  value: CacheValueSchema,
  ttl: CacheTTLSchema,
});

// ============================================
// CACHE OPTIONS VALIDATION
// ============================================

/**
 * Cache configuration options schema
 *
 * Used for configuring Cache instances with custom settings
 *
 * @example
 * const options = {
 *   prefix: "tenant",
 *   ttl: 300
 * };
 * const validated = CacheOptionsSchema.parse(options);
 */
export const CacheOptionsSchema = z.object({
  /** Default TTL for this cache instance (seconds) */
  ttl: CacheTTLSchema.optional(),

  /** Prefix for all keys in this cache instance */
  prefix: z.string().optional(),
});

// ============================================
// CACHE STATISTICS VALIDATION
// ============================================

/**
 * Cache statistics response schema
 *
 * Used for validating cache statistics output
 */
export const CacheStatsSchema = z.object({
  /** Total number of cache entries */
  totalEntries: z.number().int().nonnegative(),

  /** Number of expired entries */
  expiredEntries: z.number().int().nonnegative(),

  /** Cache enabled status */
  enabled: z.boolean().optional(),

  /** Cache hit rate percentage */
  hitRate: z.number().min(0).max(100).optional(),
});

// ============================================
// CACHE OPERATION RESULT VALIDATION
// ============================================

/**
 * Cache operation result schema
 *
 * Used for validating cache operation results (get, set, delete)
 */
export const CacheOperationResultSchema = z.object({
  /** Operation success status */
  success: z.boolean(),

  /** Error message if operation failed */
  error: z.string().optional(),

  /** Whether value was found in cache (for get operations) */
  cached: z.boolean().optional(),
});

// ============================================
// TYPE EXPORTS
// ============================================

/**
 * TypeScript types derived from Zod schemas
 * Ensures type consistency between runtime validation and compile-time types
 */

/** Cache key type */
export type CacheKey = z.infer<typeof CacheKeySchema>;

/** Cache value type */
export type CacheValue = z.infer<typeof CacheValueSchema>;

/** Cache TTL type */
export type CacheTTL = z.infer<typeof CacheTTLSchema>;

/** Cache entry type */
export type CacheEntry = z.infer<typeof CacheEntrySchema>;

/** Cache options type */
export type CacheOptions = z.infer<typeof CacheOptionsSchema>;

/** Cache statistics type */
export type CacheStats = z.infer<typeof CacheStatsSchema>;

/** Cache operation result type */
export type CacheOperationResult = z.infer<typeof CacheOperationResultSchema>;

// ============================================
// VALIDATION HELPER FUNCTIONS
// ============================================

/**
 * Safely validate cache key without throwing
 *
 * @param key - Cache key to validate
 * @returns Validation result with error message if invalid
 */
export function validateCacheKey(key: unknown): {
  success: boolean;
  data?: CacheKey;
  error?: string;
} {
  const result = CacheKeySchema.safeParse(key);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues[0]?.message || CACHE_ERRORS.INVALID_KEY,
  };
}

/**
 * Safely validate cache TTL without throwing
 *
 * @param ttl - TTL value to validate
 * @returns Validation result with error message if invalid
 */
export function validateCacheTTL(ttl: unknown): {
  success: boolean;
  data?: CacheTTL;
  error?: string;
} {
  const result = CacheTTLSchema.safeParse(ttl);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues[0]?.message || CACHE_ERRORS.INVALID_TTL,
  };
}

/**
 * Safely validate cache value without throwing
 *
 * @param value - Value to validate
 * @returns Validation result with error message if invalid
 */
export function validateCacheValue(value: unknown): {
  success: boolean;
  data?: CacheValue;
  error?: string;
} {
  const result = CacheValueSchema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues[0]?.message || 'Cache value validation failed',
  };
}
