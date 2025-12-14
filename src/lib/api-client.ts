/**
 * Centralized API Client
 *
 * Single source of truth for all API requests to ensure:
 * - Consistent authentication (credentials included in all requests)
 * - Standardized error handling (throws on error - JavaScript standard)
 * - Type-safe request/response patterns
 * - DRY principle compliance
 *
 * Usage:
 * ```typescript
 * try {
 *   const users = await ApiClient.get<User[]>('/users');
 *   // use users directly
 * } catch (error) {
 *   if (error instanceof ApiClientError) {
 *     console.error(`API Error ${error.status}: ${error.message}`);
 *   }
 * }
 * ```
 *
 * @see CLAUDE.md - Coding Standards: Single Source of Truth, DRY, Centralized Approaches
 */

import { API_CONFIG, API_ERROR_MESSAGES, CONTENT_TYPES } from './api-constants';
import { AUTH_ROUTES } from './auth-routes';
import toast from 'react-hot-toast';
import { TOAST_MESSAGES } from './constants/toast-messages';
import { AUTH_INTERVALS } from './constants/polling-config';

export interface ApiRequestOptions extends RequestInit {
  /** Query parameters to append to the URL */
  params?: Record<string, string | number | boolean | undefined>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface ApiError {
  message: string;
  status: number;
  error?: string;
  details?: unknown;
}

/**
 * API Client Error - thrown when API requests fail
 * Standard JavaScript pattern: throw errors instead of returning error states
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Centralized API Client for all internal API requests
 */
export class ApiClient {
  private static baseUrl = API_CONFIG.BASE_URL;

  // Token expiration tracking for automatic refresh
  private static tokenExpiresAt: Date | null = null;
  private static refreshInProgress = false;
  private static refreshPromise: Promise<void> | null = null;

  // Refresh token 5 minutes before expiration
  private static readonly TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

  // 401 retry tracking (prevent infinite retry loops)
  private static readonly MAX_RETRY_ATTEMPTS = 1;
  private static retryAttempts = new Map<string, number>();

  // Toast notification throttling (prevent spam)
  private static lastToastTime = 0;

  /**
   * Build URL with query parameters
   */
  private static buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = endpoint.startsWith('/api')
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    if (!params) return url;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  /**
   * Set token expiration time (called after successful login or token refresh)
   */
  static setTokenExpiration(expiresAt: Date | string) {
    this.tokenExpiresAt =
      typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  }

  /**
   * Clear token expiration (called on logout)
   */
  static clearTokenExpiration() {
    this.tokenExpiresAt = null;
    this.refreshInProgress = false;
    this.refreshPromise = null;
  }

  /**
   * Check if token needs refresh
   */
  private static needsTokenRefresh(): boolean {
    if (!this.tokenExpiresAt) return false;

    const now = new Date();
    const expiresAt = new Date(this.tokenExpiresAt);
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    // Refresh if token expires within threshold (5 minutes)
    return (
      timeUntilExpiry <= this.TOKEN_REFRESH_THRESHOLD_MS && timeUntilExpiry > 0
    );
  }

  /**
   * Refresh access token using refresh token
   * Prevents concurrent refresh requests by using a shared promise
   */
  private static async refreshTokenIfNeeded(): Promise<void> {
    // Don't refresh if not needed or if already refreshing
    if (!this.needsTokenRefresh()) return;

    // If already refreshing, wait for that refresh to complete
    if (this.refreshInProgress && this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start new refresh
    this.refreshInProgress = true;
    this.refreshPromise = (async () => {
      try {
        // Call refresh endpoint (skip our own interceptor to avoid infinite loop)
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          // Refresh failed - clear token and redirect to login
          this.clearTokenExpiration();
          if (typeof window !== 'undefined') {
            window.location.href = AUTH_ROUTES.LOGIN;
          }
          throw new ApiClientError('Session expired', 401);
        }

        const data = (await response.json()) as {
          success: boolean;
          tokenExpiration?: { accessToken: string };
        };

        // Update token expiration time
        if (data.success && data.tokenExpiration?.accessToken) {
          this.setTokenExpiration(data.tokenExpiration.accessToken);
        }
      } catch (error) {
        this.clearTokenExpiration();
        throw error;
      } finally {
        this.refreshInProgress = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Check if we should show a toast notification (throttled)
   */
  private static shouldShowToast(): boolean {
    const now = Date.now();
    if (now - this.lastToastTime > AUTH_INTERVALS.TOAST_THROTTLE) {
      this.lastToastTime = now;
      return true;
    }
    return false;
  }

  /**
   * Force token refresh (used by 401 interceptor)
   * Called when we receive a 401 error to attempt recovery
   * Shows user-friendly toast notifications
   */
  private static async forceTokenRefresh(): Promise<void> {
    // If already refreshing, wait for that refresh to complete
    if (this.refreshInProgress && this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start new refresh
    this.refreshInProgress = true;

    // Show loading toast (throttled to prevent spam)
    let toastId: string | undefined;
    if (this.shouldShowToast() && typeof window !== 'undefined') {
      toastId = toast.loading(TOAST_MESSAGES.AUTH.SESSION_REFRESHING);
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          this.clearTokenExpiration();

          // Show error toast and redirect
          if (toastId && typeof window !== 'undefined') {
            toast.error(TOAST_MESSAGES.AUTH.SESSION_EXPIRED, { id: toastId });
          }

          // Delay redirect to show message
          if (typeof window !== 'undefined') {
            setTimeout(() => {
              window.location.href = AUTH_ROUTES.LOGIN;
            }, AUTH_INTERVALS.REDIRECT_DELAY);
          }

          throw new ApiClientError('Session expired', 401);
        }

        const data = (await response.json()) as {
          success: boolean;
          tokenExpiration?: { accessToken: string };
        };

        if (data.success && data.tokenExpiration?.accessToken) {
          this.setTokenExpiration(data.tokenExpiration.accessToken);

          // Show success toast
          if (toastId && typeof window !== 'undefined') {
            toast.success(TOAST_MESSAGES.AUTH.SESSION_REFRESHED, {
              id: toastId,
            });
          }
        }
      } catch (error) {
        this.clearTokenExpiration();
        throw error;
      } finally {
        this.refreshInProgress = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Make an API request with automatic credential inclusion
   * Throws ApiClientError on failure (standard JavaScript pattern)
   */
  private static async request<T = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const {
      params,
      timeout = API_CONFIG.DEFAULT_TIMEOUT,
      ...fetchOptions
    } = options;

    // Automatically refresh token if needed (skip for auth endpoints to avoid loops)
    if (
      !endpoint.includes('/api/auth/refresh') &&
      !endpoint.includes('/api/auth/login')
    ) {
      try {
        await this.refreshTokenIfNeeded();
      } catch (error) {
        // If refresh fails, let the request proceed (will handle 401 in Phase 6)
        console.error('Token refresh failed:', error);
      }
    }

    // Build URL with query parameters
    const url = this.buildUrl(endpoint, params);

    // Build headers: Don't set Content-Type for FormData (browser sets it with boundary)
    const headers: Record<string, string> = {
      ...((fetchOptions.headers as Record<string, string>) || {}),
    };

    // Only set Content-Type for JSON if body is not FormData
    const isFormData = fetchOptions.body instanceof FormData;
    if (!isFormData && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = CONTENT_TYPES.JSON;
    }

    // Ensure credentials are always included for authentication
    const requestOptions: RequestInit = {
      ...fetchOptions,
      credentials: 'include', // CRITICAL: Include cookies for authentication
      headers,
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response
      let data: T;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else if (contentType?.includes('text/')) {
        data = (await response.text()) as T;
      } else {
        // For binary data (images, files, etc.)
        data = (await response.blob()) as T;
      }

      // Handle error responses - throw error (standard JavaScript pattern)
      if (!response.ok) {
        // Special handling for 401 Unauthorized - attempt token refresh and retry
        if (response.status === 401 && !endpoint.includes('/api/auth/')) {
          const requestKey = `${endpoint}:${JSON.stringify(options)}`;
          const attempts = this.retryAttempts.get(requestKey) || 0;

          // Only retry once to prevent infinite loops
          if (attempts < this.MAX_RETRY_ATTEMPTS) {
            this.retryAttempts.set(requestKey, attempts + 1);

            try {
              // Force token refresh
              await this.forceTokenRefresh();

              // Retry the original request
              const retryResult = await this.request<T>(endpoint, options);

              // Clear retry counter on success
              this.retryAttempts.delete(requestKey);

              return retryResult;
            } catch {
              // Clear retry counter and fall through to throw original error
              this.retryAttempts.delete(requestKey);

              // Redirect to login if refresh fails
              if (typeof window !== 'undefined') {
                window.location.href = AUTH_ROUTES.LOGIN;
              }
            }
          } else {
            // Max retries exceeded - clear counter and redirect to login
            this.retryAttempts.delete(requestKey);
            if (typeof window !== 'undefined') {
              window.location.href = AUTH_ROUTES.LOGIN;
            }
          }
        }

        const errorMessage =
          (data as ApiError)?.message ||
          (data as ApiError)?.error ||
          'Request failed';
        throw new ApiClientError(errorMessage, response.status, data);
      }

      // Clear retry counter on successful response
      const requestKey = `${endpoint}:${JSON.stringify(options)}`;
      this.retryAttempts.delete(requestKey);

      // Return data directly (not wrapped in response object)
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiClientError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ApiClientError(
            API_ERROR_MESSAGES.TIMEOUT,
            API_CONFIG.HTTP_STATUS.TIMEOUT
          );
        }
        throw new ApiClientError(
          error.message,
          API_CONFIG.HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
      }

      throw new ApiClientError(
        API_ERROR_MESSAGES.UNKNOWN_ERROR,
        API_CONFIG.HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * HTTP GET request
   * @throws {ApiClientError} When request fails
   * @returns Promise that resolves to the response data directly
   */
  static async get<T = unknown>(
    endpoint: string,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'GET',
    });
  }

  /**
   * HTTP POST request
   * @throws {ApiClientError} When request fails
   * @returns Promise that resolves to the response data directly
   */
  static async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * HTTP PUT request
   * @throws {ApiClientError} When request fails
   * @returns Promise that resolves to the response data directly
   */
  static async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * HTTP PATCH request
   * @throws {ApiClientError} When request fails
   * @returns Promise that resolves to the response data directly
   */
  static async patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * HTTP DELETE request
   * @throws {ApiClientError} When request fails
   * @returns Promise that resolves to the response data directly
   */
  static async delete<T = unknown>(
    endpoint: string,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'DELETE',
    });
  }
}

/**
 * Convenience function for making authenticated API requests
 *
 * @example
 * ```typescript
 * // Simple GET request - data returned directly
 * const tables = await apiRequest<Table[]>('/tables');
 *
 * // GET with query parameters
 * const orders = await apiRequest<Order[]>('/orders', { params: { status: 'pending' } });
 *
 * // POST request
 * const newOrder = await apiRequest<Order>('/orders', {
 *   method: 'POST',
 *   body: { items: [...] }
 * });
 *
 * // Error handling (standard JavaScript pattern)
 * try {
 *   const data = await apiRequest('/protected');
 * } catch (error) {
 *   if (error instanceof ApiClientError) {
 *     console.error(`API Error ${error.status}: ${error.message}`);
 *   }
 * }
 * ```
 *
 * @throws {ApiClientError} When request fails
 * @returns Promise that resolves to the response data directly
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options?: ApiRequestOptions & { body?: unknown }
): Promise<T> {
  const { body, ...restOptions } = options || {};

  if (body && !options?.method) {
    // Default to POST if body is provided without method
    return ApiClient.post<T>(endpoint, body, restOptions);
  }

  const method = options?.method?.toUpperCase() || 'GET';

  switch (method) {
    case 'GET':
      return ApiClient.get<T>(endpoint, restOptions);
    case 'POST':
      return ApiClient.post<T>(endpoint, body, restOptions);
    case 'PUT':
      return ApiClient.put<T>(endpoint, body, restOptions);
    case 'PATCH':
      return ApiClient.patch<T>(endpoint, body, restOptions);
    case 'DELETE':
      return ApiClient.delete<T>(endpoint, restOptions);
    default:
      throw new Error(`Unsupported HTTP method: ${method}`);
  }
}

// Export default for convenience
export default ApiClient;
