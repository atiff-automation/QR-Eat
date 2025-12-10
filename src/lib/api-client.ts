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

  /**
   * Build URL with query parameters
   */
  private static buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = endpoint.startsWith('/api') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

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
   * Make an API request with automatic credential inclusion
   * Throws ApiClientError on failure (standard JavaScript pattern)
   */
  private static async request<T = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const { params, timeout = API_CONFIG.DEFAULT_TIMEOUT, ...fetchOptions } = options;

    // Build URL with query parameters
    const url = this.buildUrl(endpoint, params);

    // Build headers: Don't set Content-Type for FormData (browser sets it with boundary)
    const headers: HeadersInit = { ...fetchOptions.headers };

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
        const errorMessage = (data as ApiError)?.message || (data as ApiError)?.error || 'Request failed';
        throw new ApiClientError(errorMessage, response.status, data);
      }

      // Return data directly (not wrapped in response object)
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiClientError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ApiClientError(API_ERROR_MESSAGES.TIMEOUT, API_CONFIG.HTTP_STATUS.TIMEOUT);
        }
        throw new ApiClientError(error.message, API_CONFIG.HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }

      throw new ApiClientError(API_ERROR_MESSAGES.UNKNOWN_ERROR, API_CONFIG.HTTP_STATUS.INTERNAL_SERVER_ERROR);
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
