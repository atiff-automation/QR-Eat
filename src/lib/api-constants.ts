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
