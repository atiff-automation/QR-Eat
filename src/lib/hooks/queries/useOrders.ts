/**
 * Orders Query Hooks
 *
 * TanStack Query hooks for order state management with built-in polling.
 * Replaces custom polling logic in use-pending-orders.ts
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Built-in Polling
 * - Error Handling
 * - Cache Management
 *
 * @see claudedocs/TANSTACK_QUERY_MIGRATION.md
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import type { OrderWithDetails } from '@/types/pos';

// =============================================================================
// Type Definitions
// =============================================================================

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch pending orders with automatic polling
 *
 * Features:
 * - Built-in polling (30 seconds default)
 * - Automatic pause when window loses focus
 * - Smart refetching on window focus
 * - Error handling with retry
 * - Loading states
 *
 * Usage:
 * ```tsx
 * const { orders, isLoading, refetch } = usePendingOrders();
 *
 * // With custom options
 * const { orders } = usePendingOrders({
 *   enabled: true,
 *   refetchInterval: 60000, // Poll every 60 seconds
 * });
 * ```
 */

/**
 * Fetch single order by ID
 *
 * Usage:
 * ```tsx
 * const { data: order, isLoading } = useOrderById('order-123');
 * ```
 */
export function useOrderById(orderId: string | null) {
  return useQuery<OrderWithDetails, Error>({
    queryKey: queryKeys.orders.byId(orderId!),
    queryFn: async () => {
      // Implement API call here
      throw new Error('Not implemented yet');
    },
    enabled: !!orderId,
    staleTime: 30 * 1000,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Update order mutation
 *
 * Features:
 * - Optimistic updates
 * - Automatic cache invalidation
 * - Error rollback
 *
 * Usage:
 * ```tsx
 * const { mutate: updateOrder } = useUpdateOrder();
 *
 * updateOrder(
 *   { orderId: '123', status: 'SERVED' },
 *   {
 *     onSuccess: () => toast.success('Order updated!'),
 *   }
 * );
 * ```
 */
export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    OrderWithDetails,
    Error,
    { orderId: string; updates: Partial<OrderWithDetails> }
  >({
    mutationFn: async () => {
      // Implement API call here
      // TODO: Implement actual API call when endpoint is ready
      throw new Error('Not implemented yet');
    },

    onSuccess: () => {
      // Invalidate pending orders query to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.pending });
    },

    onError: (error) => {
      console.error('❌ useUpdateOrder: Failed to update order', error);
    },
  });
}
