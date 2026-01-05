/**
 * Debug utility for development logging
 *
 * Automatically disabled in production to reduce bundle size and improve performance.
 * Errors are always logged regardless of environment.
 */

const IS_DEV = process.env.NODE_ENV === 'development';

export const debug = {
  /**
   * Log informational messages
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: (message: string, context?: any) => {
    if (IS_DEV) {
      console.log(`[DEBUG] ${message}`, context || '');
    } else {
      // Structured logging for production
      console.log(
        JSON.stringify({
          level: 'debug',
          message,
          ...context,
          timestamp: new Date().toISOString(),
        })
      );
    }
  },

  /**
   * Log warning messages
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (message: string, context?: any) => {
    if (IS_DEV) {
      console.warn(`[WARN] ${message}`, context || '');
    } else {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message,
          ...context,
          timestamp: new Date().toISOString(),
        })
      );
    }
  },

  /**
   * Log error messages
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (message: string, error?: any, context?: any) => {
    const errorData = {
      level: 'error',
      message,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
      ...context,
      timestamp: new Date().toISOString(),
    };

    if (IS_DEV) {
      console.error(`[ERROR] ${message}`, error || '', context || '');
    } else {
      console.error(JSON.stringify(errorData));
    }
  },

  /**
   * Log informational messages with a prefix
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (prefix: string, message: string, context?: any) => {
    if (IS_DEV) {
      console.log(`[${prefix}] ${message}`, context || '');
    } else {
      console.log(
        JSON.stringify({
          level: 'info',
          prefix,
          message,
          ...context,
          timestamp: new Date().toISOString(),
        })
      );
    }
  },
};
