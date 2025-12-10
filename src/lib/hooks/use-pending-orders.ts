/**
 * usePendingOrders Hook
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - State Management
 * - Error Handling
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { OrderWithDetails } from '@/types/pos';
import { fetchPendingOrders } from '@/lib/services/payment-service';

interface UsePendingOrdersOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface UsePendingOrdersReturn {
  orders: OrderWithDetails[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  totalOrders: number;
  totalRevenue: number;
}

export function usePendingOrders(
  options: UsePendingOrdersOptions = {}
): UsePendingOrdersReturn {
  const { autoRefresh = true, refreshInterval = 30000 } = options;

  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const result = await fetchPendingOrders();
      if (result.success) {
        setOrders(result.orders);
      } else {
        setError('Failed to load pending orders');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadOrders(true);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadOrders]);

  const refresh = useCallback(async () => {
    await loadOrders(true);
  }, [loadOrders]);

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce(
    (sum, order) => sum + Number(order.totalAmount),
    0
  );

  return {
    orders,
    isLoading,
    isRefreshing,
    error,
    refresh,
    totalOrders,
    totalRevenue,
  };
}
