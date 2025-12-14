/**
 * Toast Notification Messages
 *
 * Single source of truth for all toast notification messages.
 * Centralized to ensure consistency and easy updates.
 *
 * @see CLAUDE.md - No Hardcoding principle
 */

/**
 * Authentication and session-related toast messages
 */
export const TOAST_MESSAGES = {
  AUTH: {
    /** Shown when token refresh is in progress */
    SESSION_REFRESHING: 'Refreshing session...',

    /** Shown when token refresh completes successfully */
    SESSION_REFRESHED: 'Session refreshed successfully',

    /** Shown when session has expired and user will be redirected */
    SESSION_EXPIRED: 'Session expired. Redirecting to login...',

    /** Shown when token refresh fails */
    SESSION_REFRESH_FAILED: 'Unable to refresh session. Please log in again.',

    /** Shown when user is logged out */
    LOGOUT_SUCCESS: 'Logged out successfully',

    /** Shown when login is successful */
    LOGIN_SUCCESS: 'Logged in successfully',
  },

  /**
   * Real-time connection status messages
   */
  CONNECTION: {
    /** Shown when connection to server is lost */
    LOST: 'Connection lost. Retrying...',

    /** Shown when connection is re-established */
    RECONNECTED: 'Reconnected successfully',

    /** Shown when reconnection attempts have failed */
    FAILED: 'Unable to connect. Please refresh the page.',
  },

  /**
   * Error messages for common scenarios
   */
  ERROR: {
    /** Generic network error */
    NETWORK: 'Network error. Please check your connection.',

    /** Generic server error */
    SERVER: 'Server error. Please try again later.',

    /** Request timeout */
    TIMEOUT: 'Request timed out. Please try again.',

    /** Permission denied */
    FORBIDDEN: 'You do not have permission to perform this action.',
  },
} as const;

/**
 * Type-safe helper to get auth toast messages
 */
export type AuthToastMessage =
  (typeof TOAST_MESSAGES.AUTH)[keyof typeof TOAST_MESSAGES.AUTH];

/**
 * Type-safe helper to get connection toast messages
 */
export type ConnectionToastMessage =
  (typeof TOAST_MESSAGES.CONNECTION)[keyof typeof TOAST_MESSAGES.CONNECTION];

/**
 * Type-safe helper to get error toast messages
 */
export type ErrorToastMessage =
  (typeof TOAST_MESSAGES.ERROR)[keyof typeof TOAST_MESSAGES.ERROR];
