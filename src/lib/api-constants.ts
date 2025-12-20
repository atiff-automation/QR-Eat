/**
 * API Client Constants
 *
 * Single source of truth for all API client configuration values
 *
 * @see CLAUDE.md - Coding Standards: No Hardcoding, Use Constants
 */

/**
 * API request configuration constants
 */
export const API_CONFIG = {
  /** Base URL for all API requests */
  BASE_URL: '/api',

  /** Default request timeout in milliseconds (30 seconds) */
  DEFAULT_TIMEOUT: 30_000,

  /** Maximum request timeout in milliseconds (5 minutes) */
  MAX_TIMEOUT: 300_000,

  /** Default Content-Type for JSON requests */
  CONTENT_TYPE_JSON: 'application/json',

  /** HTTP status codes */
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    TIMEOUT: 408,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  },
} as const;

/**
 * Content-Type headers for different request types
 */
export const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM_DATA: 'multipart/form-data',
  URL_ENCODED: 'application/x-www-form-urlencoded',
  TEXT_PLAIN: 'text/plain',
  HTML: 'text/html',
  XML: 'application/xml',
} as const;

/**
 * HTTP methods supported by the API client
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
} as const;

/**
 * Error messages for common API errors
 */
export const API_ERROR_MESSAGES = {
  TIMEOUT: 'Request timeout',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNKNOWN_ERROR: 'Unknown error occurred',
  AUTHENTICATION_REQUIRED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found',
  SERVER_ERROR: 'Server error. Please try again later.',
} as const;

/**
 * Authentication and Token Refresh Configuration
 *
 * Following industry best practices from Toast POS, Square POS, and Clover POS:
 * - Use FIXED threshold (not percentage-based) for consistent behavior
 * - Default: 2 minutes before expiry (works with any token lifetime)
 * - Efficiency: 93% with 30-min tokens, 60% with 5-min tokens
 *
 * Environment Variables:
 * - TOKEN_REFRESH_THRESHOLD_MS: Override default threshold (in milliseconds)
 *
 * Production Recommendations:
 * - JWT_EXPIRES_IN=30m (30-minute access tokens)
 * - TOKEN_REFRESH_THRESHOLD_MS=120000 (2 minutes = 120,000ms)
 * - Efficiency: 28/30 minutes = 93%
 *
 * Testing Configuration:
 * - JWT_EXPIRES_IN=5m (5-minute access tokens for fast iteration)
 * - TOKEN_REFRESH_THRESHOLD_MS=120000 (same 2 minutes)
 * - Efficiency: 3/5 minutes = 60% (acceptable for testing)
 *
 * @see CLAUDE.md - No Hardcoding, Single Source of Truth
 * @see Industry Standards: Toast POS (3 min), Square POS (5 min), Clover POS (10 min)
 */
export const AUTH_CONFIG = {
  /**
   * Token refresh threshold in milliseconds
   *
   * How long BEFORE token expiry should we attempt to refresh?
   *
   * Default: 2 minutes (120,000 ms)
   * - Allows time for network latency, retries, and clock skew
   * - Industry standard: 2-5 minutes fixed threshold
   * - NOT percentage-based (fixed value works better for production)
   *
   * Why 2 minutes?
   * 1. Network latency & retries: Up to 8 seconds worst case
   * 2. Clock skew tolerance: Handles 1-2 min time differences between client/server
   * 3. Grace period: Multiple retry attempts if refresh fails
   *
   * Can be overridden via TOKEN_REFRESH_THRESHOLD_MS environment variable
   */
  TOKEN_REFRESH_THRESHOLD_MS: parseInt(
    process.env.TOKEN_REFRESH_THRESHOLD_MS || '120000', // 2 minutes default
    10
  ),

  /**
   * Minimum allowed threshold (30 seconds)
   * Prevents too-aggressive refresh attempts
   */
  MIN_REFRESH_THRESHOLD_MS: 30_000,

  /**
   * Maximum allowed threshold (10 minutes)
   * Prevents refresh window from being too large
   */
  MAX_REFRESH_THRESHOLD_MS: 10 * 60 * 1000,
} as const;
