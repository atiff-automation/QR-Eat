/**
 * Auth-Aware Polling Hook
 *
 * Custom React hook that provides automatic polling with authentication awareness.
 * Automatically stops polling on 401 errors and lets the API client handle token refresh.
 *
 * Features:
 * - Auto-stops polling on authentication errors
 * - Resumes polling after successful token refresh
 * - Proper cleanup on component unmount
 * - TypeScript generics for type-safe data
 * - Loading and error states
 *
 * @see CLAUDE.md - DRY principle, Single Source of Truth
 * @see CLAUDE.md - Type Safety (no any types)
 *
 * @example
 * ```typescript
 * // In a component:
 * const { data, error, isLoading } = useAuthAwarePolling<Order[]>(
 *   '/api/pos/orders/pending',
 *   POLLING_INTERVALS.ORDERS
 * );
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

/**
 * Result interface for the polling hook
 *
 * @template T - The expected data type from the API endpoint
 */
export interface UseAuthAwarePollingResult<T> {
  /** The fetched data, null if not yet loaded or on error */
  data: T | null;

  /** Error object if the request failed, null otherwise */
  error: ApiClientError | null;

  /** True while the initial request is loading */
  isLoading: boolean;

  /** True while polling is active and running */
  isPolling: boolean;

  /** Manually trigger a refetch (useful for refresh buttons) */
  refetch: () => Promise<void>;
}

/**
 * Auth-aware polling hook
 *
 * Polls an API endpoint at regular intervals with automatic authentication error handling.
 * Stops polling when a 401 error is encountered, allowing the API client to handle token refresh.
 *
 * @template T - The expected data type from the API endpoint
 * @param endpoint - The API endpoint to poll (e.g., '/api/pos/orders/pending')
 * @param interval - Polling interval in milliseconds (use POLLING_INTERVALS constants)
 * @param enabled - Whether polling should be active (default: true)
 * @returns Polling state including data, error, loading status, and refetch function
 */
export function useAuthAwarePolling<T>(
  endpoint: string,
  interval: number,
  enabled = true
): UseAuthAwarePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  /**
   * Fetch data from the endpoint
   * Handles 401 errors by stopping polling
   */
  const fetchData = useCallback(async (): Promise<void> => {
    try {
      const result = await ApiClient.get<T>(endpoint);

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setData(result);
        setError(null);
        setIsLoading(false);
      }
    } catch (err) {
      // Only update state if component is still mounted
      if (!isMountedRef.current) return;

      if (err instanceof ApiClientError) {
        // On 401 error, stop polling and let API client handle refresh
        if (err.status === 401) {
          console.log(
            '[useAuthAwarePolling] 401 detected, stopping polling to allow token refresh'
          );
          setIsPolling(false);

          // Clear interval to stop polling
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }

        setError(err);
      } else {
        // Wrap non-ApiClientError errors
        setError(
          new ApiClientError(
            err instanceof Error ? err.message : 'Unknown error',
            500
          )
        );
      }

      setIsLoading(false);
    }
  }, [endpoint]);

  /**
   * Start polling
   */
  useEffect(() => {
    // Don't start polling if not enabled
    if (!enabled) {
      setIsPolling(false);
      return;
    }

    // Fetch immediately on mount or when endpoint changes
    setIsLoading(true);
    setIsPolling(true);
    fetchData();

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      fetchData();
    }, interval);

    // Cleanup function
    return () => {
      setIsPolling(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [endpoint, interval, enabled, fetchData]);

  /**
   * Track component mount status for cleanup
   */
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    await fetchData();
  }, [fetchData]);

  return {
    data,
    error,
    isLoading,
    isPolling,
    refetch,
  };
}
