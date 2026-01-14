/**
 * TanStack Query Monitor
 *
 * Monitors TanStack Query cache events and performance.
 * Integrates with PerformanceTracker for comprehensive metrics.
 *
 * @see tanstack_implementation_plan.md
 */

import { QueryClient } from '@tanstack/react-query';
import { PerformanceTracker } from './performance-tracker';

/**
 * Setup monitoring for TanStack Query
 *
 * Subscribes to query and mutation cache events to track:
 * - Cache hits/misses
 * - Query success/error rates
 * - Mutation success/error rates
 */
export function setupQueryMonitoring(queryClient: QueryClient): void {
  if (process.env.NODE_ENV !== 'development') {
    return; // Only monitor in development
  }

  console.log('🔍 [QueryMonitor] Setting up TanStack Query monitoring...');

  // Monitor query cache
  queryClient.getQueryCache().subscribe((event) => {
    if (!event) return;

    switch (event.type) {
      case 'added':
        console.log('[QueryMonitor] Query added:', event.query.queryKey);
        break;

      case 'updated':
        const query = event.query;
        const state = query.state;

        if (state.status === 'success') {
          // Track cache hit if data was already present
          if (state.dataUpdatedAt > 0) {
            PerformanceTracker.trackCacheHit(JSON.stringify(query.queryKey));
          }
        } else if (state.status === 'error') {
          console.error('[QueryMonitor] Query error:', {
            queryKey: query.queryKey,
            error: state.error,
          });
        }
        break;

      case 'removed':
        console.log('[QueryMonitor] Query removed:', event.query.queryKey);
        break;
    }
  });

  // Monitor mutation cache
  queryClient.getMutationCache().subscribe((event) => {
    if (!event) return;

    switch (event.type) {
      case 'added':
        console.log('[QueryMonitor] Mutation added');
        break;

      case 'updated':
        const mutation = event.mutation;
        const state = mutation.state;

        if (state.status === 'success') {
          console.log('[QueryMonitor] Mutation success:', {
            variables: state.variables,
          });
        } else if (state.status === 'error') {
          console.error('[QueryMonitor] Mutation error:', {
            variables: state.variables,
            error: state.error,
          });
        }
        break;
    }
  });

  console.log('✅ [QueryMonitor] Monitoring setup complete');
}

/**
 * Get TanStack Query cache statistics
 */
export function getQueryCacheStats(queryClient: QueryClient) {
  const queryCache = queryClient.getQueryCache();
  const queries = queryCache.getAll();

  const stats = {
    totalQueries: queries.length,
    activeQueries: queries.filter((q) => q.getObserversCount() > 0).length,
    staleQueries: queries.filter((q) => q.isStale()).length,
    fetchingQueries: queries.filter((q) => q.state.fetchStatus === 'fetching')
      .length,
    errorQueries: queries.filter((q) => q.state.status === 'error').length,
    successQueries: queries.filter((q) => q.state.status === 'success').length,
  };

  return stats;
}
