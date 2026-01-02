/**
 * Debug utility for development logging
 *
 * Automatically disabled in production to reduce bundle size and improve performance.
 * Errors are always logged regardless of environment.
 */

const IS_DEV = process.env.NODE_ENV === 'development';

export const debug = {
  /**
   * Log informational messages (development only)
   */
  log: (...args: unknown[]) => {
    if (IS_DEV) console.log(...args);
  },

  /**
   * Log warning messages (development only)
   */
  warn: (...args: unknown[]) => {
    if (IS_DEV) console.warn(...args);
  },

  /**
   * Log error messages (always logged)
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },

  /**
   * Log informational messages with a prefix (development only)
   */
  info: (prefix: string, ...args: unknown[]) => {
    if (IS_DEV) console.log(`[${prefix}]`, ...args);
  },
};
