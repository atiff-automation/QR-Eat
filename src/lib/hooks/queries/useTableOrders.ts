/**
 * Table Orders Query Hook
 *
 * TanStack Query hook for fetching orders for a specific table.
 * Used by TableDetailModal to display orders and enable payment processing.
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Built-in Polling
 * - Error Handling
 * - Cache Management
 *
 * @see implementation_plan.md - Phase 2: Frontend Hook
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { ApiClient } from '@/lib/api-client';
import type { TableOrdersResponse } from '@/types/pos';

export interface UseTableOrdersOptions {
  /**
   * Enable automatic polling
   * @default true
   */
  enabled?: boolean;

  /**
   * Polling interval in milliseconds
   * @default 30000 (30 seconds)
   */
  refetchInterval?: number;
}

export interface UseTableOrdersReturn {
  orders: TableOrdersResponse['orders'];
  tableTotal: number;
  paidTotal: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetch orders for a specific table with automatic polling
 *
 * Features:
 * - Real-time updates when modal is open (30s polling)
 * - Automatic refetch on payment completion
 * - Error handling with retry
 * - Type-safe response
 *
 * Usage:
 * ```tsx
 * const { orders, tableTotal, isLoading } = useTableOrders(
 *   tableId,
 *   isModalOpen // Only fetch when modal is open
 * );
 * ```
 */
export function useTableOrders(
  tableId: string | null,
  enabled: boolean = true,
  options: UseTableOrdersOptions = {}
): UseTableOrdersReturn {
  const { refetchInterval = 30000 } = options;

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch: queryRefetch,
  } = useQuery<TableOrdersResponse, Error>({
    queryKey: queryKeys.tables.orders(tableId!),
    queryFn: async () => {
      const result = await ApiClient.get<TableOrdersResponse>(
        `/tables/${tableId}/orders`
      );

      if (!result.success) {
        throw new Error('Failed to load table orders');
      }

      return result;
    },
    enabled: enabled && !!tableId,
    staleTime: 10 * 1000, // Consider data stale after 10 seconds
    refetchInterval: enabled ? refetchInterval : false, // Poll every 30s when enabled
    refetchIntervalInBackground: false, // Pause polling when tab not visible
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    retry: 1,
  });

  // Manual refetch wrapper
  const refetch = async () => {
    await queryRefetch();
  };

  // Extract data with defaults
  const orders = data?.orders ?? [];
  const tableTotal = data?.tableTotal ?? 0;
  const paidTotal = data?.paidTotal ?? 0;

  return {
    orders,
    tableTotal,
    paidTotal,
    isLoading,
    isRefreshing: isFetching && !isLoading, // Is refetching (not initial load)
    error: error?.message ?? null,
    refetch,
  };
}
