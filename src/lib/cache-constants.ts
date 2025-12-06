/**
 * Cache Configuration Constants
 * Single Source of Truth for all cache-related configuration
 *
 * @see CLAUDE.md - No Hardcoding principle
 * @see claudedocs/CODING_STANDARDS.md - Centralized configuration
 *
 * Purpose: Eliminates hardcoded values and provides centralized cache configuration
 * All cache-related magic numbers and strings must be defined here
 */

// ============================================
// CACHE TTL VALUES (in seconds)
// ============================================

/**
 * Time-to-Live configuration for different cache types
 * All values in seconds for consistency
 */
export const CACHE_TTL = {
  /** Tenant/Restaurant resolution cache - 5 minutes */
  TENANT: 300,

  /** User session cache - 24 hours */
  SESSION: 86400,

  /** Permission/RBAC cache - 5 minutes */
  PERMISSION: 300,

  /** Menu items and categories cache - 10 minutes */
  MENU: 600,

  /** Short-lived cache - 1 minute */
  SHORT: 60,

  /** Long-lived cache - 1 hour */
  LONG: 3600,

  /** Extra long cache - 24 hours */
  EXTRA_LONG: 86400,

  /** Maximum allowed TTL - 30 days */
  MAX_TTL: 2592000,
} as const;

// ============================================
// CACHE KEY PREFIXES
// ============================================

/**
 * Namespace prefixes for cache keys
 * Prevents key collisions between different cache types
 */
export const CACHE_PREFIX = {
  /** Tenant/Restaurant cache prefix */
  TENANT: 'tenant',

  /** Session cache prefix */
  SESSION: 'session',

  /** Permission cache prefix */
  PERMISSION: 'permission',

  /** Menu cache prefix */
  MENU: 'menu',

  /** Order cache prefix */
  ORDER: 'order',

  /** Table cache prefix */
  TABLE: 'table',

  /** Staff cache prefix */
  STAFF: 'staff',
} as const;

// ============================================
// CACHE CLEANUP CONFIGURATION
// ============================================

/**
 * Configuration for automatic cache cleanup cron job
 */
export const CACHE_CLEANUP = {
  /** Cleanup interval - 10 minutes */
  INTERVAL_MS: 10 * 60 * 1000,

  /** Batch size for deletion operations */
  BATCH_SIZE: 100,

  /** Cleanup enabled flag */
  ENABLED: true,
} as const;

// ============================================
// CACHE ERROR MESSAGES
// ============================================

/**
 * Standardized error messages for cache operations
 * Provides consistent error handling across the application
 */
export const CACHE_ERRORS = {
  /** Failed to retrieve cache entry */
  GET_FAILED: 'Failed to retrieve cache entry',

  /** Failed to set cache entry */
  SET_FAILED: 'Failed to set cache entry',

  /** Failed to delete cache entry */
  DELETE_FAILED: 'Failed to delete cache entry',

  /** Failed to cleanup expired cache entries */
  CLEANUP_FAILED: 'Failed to cleanup expired cache entries',

  /** Cache operation validation failed */
  VALIDATION_FAILED: 'Cache operation validation failed',

  /** Invalid cache key format */
  INVALID_KEY: 'Invalid cache key format',

  /** Invalid TTL value */
  INVALID_TTL: 'Invalid TTL value',

  /** Cache value too large */
  VALUE_TOO_LARGE: 'Cache value exceeds maximum size',

  /** Database connection error */
  DB_CONNECTION_ERROR: 'Database connection error during cache operation',
} as const;

// ============================================
// CACHE METRICS AND LIMITS
// ============================================

/**
 * Performance metrics and operational limits
 */
export const CACHE_METRICS = {
  /** Maximum cache key length (PostgreSQL VARCHAR limit) */
  MAX_KEY_LENGTH: 255,

  /** Maximum cache value size in megabytes */
  MAX_VALUE_SIZE_MB: 10,

  /** Expected operation latency in milliseconds */
  EXPECTED_LATENCY_MS: 100,

  /** Cache hit rate warning threshold (percentage) */
  HIT_RATE_WARNING_THRESHOLD: 70,
} as const;

// ============================================
// CACHE OPERATION DEFAULTS
// ============================================

/**
 * Default values for cache operations
 */
export const CACHE_DEFAULTS = {
  /** Default TTL if none specified - 5 minutes */
  DEFAULT_TTL: CACHE_TTL.TENANT,

  /** Default prefix if none specified */
  DEFAULT_PREFIX: CACHE_PREFIX.TENANT,

  /** Enable cache by default */
  ENABLED: true,

  /** Fail gracefully on errors (don't throw) */
  FAIL_GRACEFULLY: true,
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

/**
 * Type-safe exports for constant values
 */
export type CacheTTLType = (typeof CACHE_TTL)[keyof typeof CACHE_TTL];
export type CachePrefixType = (typeof CACHE_PREFIX)[keyof typeof CACHE_PREFIX];
export type CacheErrorType = (typeof CACHE_ERRORS)[keyof typeof CACHE_ERRORS];
