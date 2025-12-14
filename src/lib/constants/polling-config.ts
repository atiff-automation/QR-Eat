/**
 * Polling Intervals Configuration
 *
 * Single source of truth for all polling intervals in the application.
 * All values are in milliseconds.
 *
 * @see CLAUDE.md - No Hardcoding principle
 */

/**
 * Polling intervals for real-time data updates
 * All values in milliseconds
 */
export const POLLING_INTERVALS = {
  /** Orders polling interval for Kitchen, Cashier, Owner (30 seconds) */
  ORDERS: 30_000,

  /** Kitchen display board polling interval (30 seconds) */
  KITCHEN: 30_000,

  /** Table status polling interval (30 seconds) */
  TABLES: 30_000,

  /** Analytics dashboard polling interval (30 seconds) */
  ANALYTICS: 30_000,

  /** Customer order tracking polling (15 seconds - faster for customer UX) */
  ORDER_TRACKING: 15_000,

  /** Order confirmation status polling (30 seconds) */
  ORDER_CONFIRMATION: 30_000,
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
