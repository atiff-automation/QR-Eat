/**
 * Polling Intervals Configuration
 *
 * Single source of truth for all polling intervals in the application.
 * All values are in milliseconds.
 *
 * @see CLAUDE.md - No Hardcoding principle
 */

/**
 * Polling Intervals for Real-Time Data Updates
 * All values in milliseconds
 *
 * ============================================================================
 * IMPORTANT: Two Types of Polling
 * ============================================================================
 *
 * 1. SSE-BACKED POLLING (Conditional - Fallback Only)
 *    - Used when component has SSE (Server-Sent Events) as primary method
 *    - Polling is DISABLED when SSE is connected
 *    - Polling is ENABLED only when SSE disconnects (fallback)
 *    - Examples: Kitchen Display, Live Orders, Customer Tracking
 *    - Pattern: useAuthAwarePolling(..., ..., !sseConnected)
 *
 * 2. REGULAR POLLING (Always-On)
 *    - Used when component has NO SSE alternative
 *    - Polling runs continuously regardless of any connection state
 *    - Examples: Analytics, Tables, Reports
 *    - Pattern: useAuthAwarePolling(..., ..., true) or default
 *
 * ============================================================================
 * Industry Standards (POS/KDS Systems):
 * ============================================================================
 * - Toast POS KDS: 10-15 seconds (SSE + fallback)
 * - Square POS KDS: 5-10 seconds (WebSocket + fallback)
 * - Clover POS KDS: 5-10 seconds (SSE + fallback)
 *
 * Our Configuration:
 * - Kitchen Display: 10s (SSE-backed - fallback only when SSE fails)
 * - Live Orders: 30s (SSE-backed - fallback only when SSE fails)
 * - Customer Tracking: 5s (SSE-backed - fallback only when SSE fails)
 * - Analytics: 30s (Regular polling - always-on, no SSE)
 * - Tables: 30s (Regular polling - always-on, no SSE)
 *
 * ============================================================================
 */
export const POLLING_INTERVALS = {
  // -------------------------------------------------------------------------
  // SSE-BACKED POLLING (Conditional - Use with !sseConnected flag)
  // -------------------------------------------------------------------------

  /**
   * Kitchen display board polling interval (10 seconds)
   * SSE-BACKED: Only polls when SSE connection fails
   * Primary: SSE via /api/events/orders
   * Fallback: Polling via /kitchen/orders
   */
  KITCHEN: 10_000,

  /**
   * Live orders board polling (30 seconds)
   * SSE-BACKED: Only polls when SSE connection fails
   * Primary: SSE via /api/events/orders
   * Fallback: Polling via /api/orders/live
   */
  ORDERS: 30_000,

  /**
   * Customer order tracking polling (5 seconds)
   * SSE-BACKED: Only polls when SSE connection fails
   * Primary: SSE via /api/events/orders
   * Fallback: Polling via customer tracking endpoint
   */
  ORDER_TRACKING: 5_000,

  /**
   * Order confirmation status polling (15 seconds)
   * SSE-BACKED: Only polls when SSE connection fails
   * Primary: SSE via /api/events/orders
   * Fallback: Polling via order confirmation endpoint
   */
  ORDER_CONFIRMATION: 15_000,

  // -------------------------------------------------------------------------
  // REGULAR POLLING (Always-On - No SSE alternative)
  // -------------------------------------------------------------------------

  /**
   * Table status polling interval (30 seconds)
   * REGULAR POLLING: Always runs (no SSE alternative)
   * Acceptable delay for non-critical table status updates
   */
  TABLES: 30_000,

  /**
   * Analytics dashboard polling interval (30 seconds)
   * REGULAR POLLING: Always runs (no SSE alternative)
   * Not time-critical, reduces server load
   */
  ANALYTICS: 30_000,
} as const;

/**
 * SSE (Server-Sent Events) configuration
 */
export const SSE_CONFIG = {
  /** Delay before attempting reconnection after connection failure (5 seconds) */
  RECONNECT_DELAY: 5_000,

  /** Maximum number of reconnection attempts before giving up */
  MAX_RECONNECT_ATTEMPTS: 3,

  /** Server keepalive ping interval (30 seconds) */
  KEEPALIVE_INTERVAL: 30_000,

  /** Timeout for SSE connection establishment (10 seconds) */
  CONNECTION_TIMEOUT: 10_000,
} as const;

/**
 * Authentication and session-related timing constants
 */
export const AUTH_INTERVALS = {
  /** Minimum time between toast notifications to prevent spam (1 minute) */
  TOAST_THROTTLE: 60_000,

  /** Delay before redirecting to login after session expiry (show message first - 2 seconds) */
  REDIRECT_DELAY: 2_000,

  /** Token refresh retry delay on failure (3 seconds) */
  REFRESH_RETRY_DELAY: 3_000,

  /** Maximum time to wait for token refresh before timeout (10 seconds) */
  REFRESH_TIMEOUT: 10_000,
} as const;

/**
 * Type-safe union of all polling interval values
 */
export type PollingInterval =
  (typeof POLLING_INTERVALS)[keyof typeof POLLING_INTERVALS];

/**
 * Type-safe union of all SSE config values
 */
export type SSEConfigValue = (typeof SSE_CONFIG)[keyof typeof SSE_CONFIG];

/**
 * Type-safe union of all auth interval values
 */
export type AuthInterval = (typeof AUTH_INTERVALS)[keyof typeof AUTH_INTERVALS];
