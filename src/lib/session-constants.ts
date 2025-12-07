/**
 * Session Management Constants
 * Single Source of Truth for session-related values
 *
 * @see CLAUDE.md - Single Source of Truth principle
 */

// Session status values
export const SESSION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  ENDED: 'ended',
} as const;

export type SessionStatus =
  (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

// Session durations (in milliseconds)
export const SESSION_DURATION = {
  DEFAULT: 4 * 60 * 60 * 1000, // 4 hours
  EXTENDED: 8 * 60 * 60 * 1000, // 8 hours
  SHORT: 2 * 60 * 60 * 1000, // 2 hours
} as const;

// Cart operation limits
export const CART_LIMITS = {
  MAX_ITEMS: 50,
  MAX_QUANTITY_PER_ITEM: 99,
  MIN_QUANTITY: 1,
} as const;

// Session validation
export const SESSION_VALIDATION = {
  TOKEN_LENGTH: 64,
  CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
} as const;

// Cart synchronization settings
export const CART_SYNC = {
  POLL_INTERVAL_MS: 10000, // 10 seconds for multi-device sync
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
} as const;
