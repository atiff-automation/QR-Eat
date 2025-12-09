/**
 * Event System Configuration Constants
 *
 * Single Source of Truth for all event-related configuration.
 * No hardcoded values - all extracted here for maintainability.
 *
 * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md
 * @see CLAUDE.md - No Hardcoding, Single Source of Truth
 */

export const EVENT_CONFIG = {
  // Polling fallback interval when SSE fails (30 seconds)
  POLLING_INTERVAL_MS: Number(process.env.EVENT_POLLING_INTERVAL_MS) || 30000,

  // Maximum retry attempts for failed event emission
  MAX_RETRY_ATTEMPTS: Number(process.env.EVENT_MAX_RETRY_ATTEMPTS) || 5,

  // Initial backoff delay for retry (exponential backoff)
  RETRY_BACKOFF_MS: 1000,

  // Maximum backoff delay (cap exponential growth)
  MAX_RETRY_BACKOFF_MS: 30000,

  // How long to keep delivered events (for audit/replay)
  EVENT_RETENTION_DAYS: Number(process.env.EVENT_RETENTION_DAYS) || 7,

  // Batch size for fetching missed events
  BATCH_SIZE: 100,

  // SSE keep-alive ping interval (30 seconds)
  SSE_KEEPALIVE_MS: 30000,

  // SSE connection timeout
  SSE_CONNECTION_TIMEOUT_MS: 5000,
} as const;

// Type-safe configuration access
export type EventConfig = typeof EVENT_CONFIG;
