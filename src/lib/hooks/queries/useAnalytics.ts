import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { useAuthUser } from './useAuth';

// Types for Revenue Analytics
export interface RevenueAnalytics {
  totalRevenue: number;
  revenueByPeriod: {
    date: string;
    amount: number;
  }[];
  comparisons: {
    period: string;
    growth: number;
  };
}

export interface RevenueParams {
  period: string; // 'today', 'week', 'month', 'year'
  granularity: string; // 'hour', 'day', 'week', 'month'
}

// Types for Order Analytics
export interface OrderAnalytics {
  totalOrders: number;
  ordersByPeriod: {
    date: string;
    count: number;
  }[];
  statusBreakdown: {
    status: string;
    count: number;
  }[];
}

export interface OrderParams {
  period: string;
  granularity: string;
}

// Types for Popular Items
export interface PopularItem {
  id: string;
  name: string;
  orderCount: number;
  revenue: number;
  trend: number; // percentage growth/decline
}

export interface PopularItemsResponse {
  items: PopularItem[];
}

export interface PopularItemsParams {
  period: string;
  limit?: number;
}

// Hook: Revenue Analytics
export const useRevenueAnalytics = (params: RevenueParams) => {
  const { restaurantId } = useAuthUser();
  const { period, granularity } = params;

  return useQuery({
    queryKey: queryKeys.analytics.revenue(period, granularity),
    queryFn: async () => {
      if (!restaurantId) throw new Error('Restaurant ID not found');

      const queryParams = new URLSearchParams({
        period,
        granularity,
      });

      const response = await ApiClient.get<{ data: RevenueAnalytics }>(
        `/staff/analytics/${restaurantId}/revenue?${queryParams.toString()}`
      );
      return response.data; // ApiClient .get returns { data: T, ... } usually, but check standard wrapper
    },
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000, // 5 minutes (analytics don't change instantly)
  });
};

// Hook: Order Analytics
export const useOrderAnalytics = (params: OrderParams) => {
  const { restaurantId } = useAuthUser();
  const { period, granularity } = params;

  return useQuery({
    queryKey: queryKeys.analytics.orders(period, granularity),
    queryFn: async () => {
      if (!restaurantId) throw new Error('Restaurant ID not found');

      const queryParams = new URLSearchParams({
        period,
        granularity,
      });

      const response = await ApiClient.get<{ data: OrderAnalytics }>(
        `/staff/analytics/${restaurantId}/orders?${queryParams.toString()}`
      );
      return response.data;
    },
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
  });
};

// Hook: Popular Items
export const usePopularItems = (params: PopularItemsParams) => {
  const { restaurantId } = useAuthUser();
  const { period, limit = 10 } = params;

  return useQuery({
    queryKey: queryKeys.analytics.popularItems(period, limit),
    queryFn: async () => {
      if (!restaurantId) throw new Error('Restaurant ID not found');

      const queryParams = new URLSearchParams({
        period,
        limit: limit.toString(),
      });

      const response = await ApiClient.get<{ data: PopularItemsResponse }>(
        `/staff/analytics/${restaurantId}/popular-items?${queryParams.toString()}`
      );
      return response.data;
    },
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
  });
};
