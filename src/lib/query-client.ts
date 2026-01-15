/**
 * TanStack Query Client Configuration
 *
 * Centralized configuration for React Query with production-ready defaults.
 *
 * Following CLAUDE.md principles:
 * - Single Source of Truth
 * - Type Safety
 * - Production Best Practices
 *
 * @see claudedocs/TANSTACK_QUERY_MIGRATION.md
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Global QueryClient instance with optimized defaults for production.
 *
 * Configuration rationale:
 * - staleTime: 5min = Balance between freshness and performance
 * - gcTime: 10min = Keep unused data briefly for quick navigation
 * - retry: 1 = Retry once for transient network issues
 * - refetchOnWindowFocus: true = Keep data fresh when user returns
 * - refetchOnReconnect: true = Update after network reconnection
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes before considering it stale
      staleTime: 5 * 60 * 1000,

      // Keep unused data in cache for 10 minutes (garbage collection)
      gcTime: 10 * 60 * 1000,

      // Retry failed requests once (not for mutations)
      retry: (failureCount, error: unknown) => {
        // Don't retry on 4xx errors (client errors)
        const status = (error as { status?: number })?.status;
        if (status && status >= 400 && status < 500) {
          return false;
        }
        // Retry once for network errors or 5xx errors
        return failureCount < 1;
      },

      // Auto-refetch when window regains focus
      refetchOnWindowFocus: true,

      // Auto-refetch when network reconnects
      refetchOnReconnect: true,

      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
    },
    mutations: {
      // Never retry mutations automatically
      retry: 0,
    },
  },
});

/**
 * Query key factory for consistent cache key management.
 *
 * Benefits:
 * - Type-safe query keys
 * - Easy cache invalidation
 * - Centralized key management
 * - Prevents typos
 *
 * Usage:
 * ```typescript
 * useQuery({ queryKey: queryKeys.auth.me, ... })
 * queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
 * ```
 */
export const queryKeys = {
  // Authentication & Authorization
  auth: {
    all: ['auth'] as const,
    me: ['auth', 'me'] as const,
    session: ['auth', 'session'] as const,
  },

  // Orders
  orders: {
    all: ['orders'] as const,
    pending: ['orders', 'PENDING'] as const,
    byId: (id: string) => ['orders', id] as const,
    byTable: (tableId: string) => ['orders', 'table', tableId] as const,
    byStatus: (status: string) => ['orders', 'status', status] as const,
  },

  // Notifications
  notifications: {
    all: ['notifications'] as const,
    unread: ['notifications', 'unread'] as const,
    byId: (id: string) => ['notifications', id] as const,
  },

  // Staff
  staff: {
    all: ['staff'] as const,
    byId: (id: string) => ['staff', id] as const,
    byRestaurant: (restaurantId: string) =>
      ['staff', 'restaurant', restaurantId] as const,
    roles: ['staff', 'roles'] as const,
  },

  // Menu
  menu: {
    all: ['menu'] as const,
    items: ['menu', 'items'] as const,
    categories: ['menu', 'categories'] as const,
    byId: (id: string) => ['menu', 'item', id] as const,
  },

  // Tables
  tables: {
    list: (restaurantId: string) =>
      ['tables', 'restaurant', restaurantId] as const,
    all: ['tables'] as const, // kept for broadcast invalidations if needed
    byId: (id: string) => ['tables', 'item', id] as const,
    available: (restaurantId: string) =>
      ['tables', 'restaurant', restaurantId, 'AVAILABLE'] as const,
    orders: (tableId: string) => ['tables', tableId, 'orders'] as const,
  },

  // Reports & Analytics
  reports: {
    all: ['reports'] as const,
    sales: (params?: Record<string, unknown>) =>
      ['reports', 'sales', params] as const,
    operational: (params?: Record<string, unknown>) =>
      ['reports', 'operational', params] as const,
    menu: (params?: Record<string, unknown>) =>
      ['reports', 'menu', params] as const,
    financial: (params?: Record<string, unknown>) =>
      ['reports', 'financial', params] as const,
    customer: (params?: Record<string, unknown>) =>
      ['reports', 'customer', params] as const,
    comprehensive: (params?: Record<string, unknown>) =>
      ['reports', 'comprehensive', params] as const,
    byType: (type: string, params?: Record<string, unknown>) =>
      ['reports', type, params] as const,
  },

  // Analytics
  analytics: {
    revenue: (period: string, granularity: string) =>
      ['analytics', 'revenue', period, granularity] as const,
    orders: (period: string, granularity: string) =>
      ['analytics', 'orders', period, granularity] as const,
    popularItems: (period: string, limit: number) =>
      ['analytics', 'popular-items', period, limit] as const,
  },

  // Restaurants (for multi-tenant)
  restaurants: {
    all: ['restaurants'] as const,
    byId: (id: string) => ['restaurants', id] as const,
    bySlug: (slug: string) => ['restaurants', 'slug', slug] as const,
    settings: ['restaurants', 'settings'] as const,
  },
} as const;

/**
 * Type-safe query key helpers
 */
export type QueryKeys = typeof queryKeys;
export type AuthQueryKeys = QueryKeys['auth'];
export type OrderQueryKeys = QueryKeys['orders'];
export type NotificationQueryKeys = QueryKeys['notifications'];
