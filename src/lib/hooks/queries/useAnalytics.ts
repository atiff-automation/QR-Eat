import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { useAuthUser } from './useAuth';

// ==========================================
// REVENUE ANALYTICS TYPES
// ==========================================
export interface RevenueAnalytics {
  period: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalRevenue: number;
    averageOrderValue: number;
    totalOrders: number;
    revenueGrowth: number;
  };
  revenueOverTime: Array<{
    period: string;
    revenue: number;
    orders: number;
    subtotal: number;
    tax: number;
    averageOrderValue: number;
  }>;
  categoryRevenue: Array<{
    categoryId: string;
    categoryName: string;
    revenue: number;
    quantity: number;
    items: number;
    percentage: number;
  }>;
  paymentMethodRevenue: Array<{
    method: string;
    revenue: number;
    transactions: number;
  }>;
  revenueGrowth: {
    currentPeriod: {
      revenue: number;
      orders: number;
    };
    previousPeriod: {
      revenue: number;
      orders: number;
    };
    growthRate: number;
    orderGrowthRate: number;
    revenueChange: number;
  };
  taxAnalytics: {
    totalSubtotal: number;
    totalTax: number;
    totalRevenue: number;
    averageTaxRate: number;
    taxableOrders: number;
  };
  refundAnalytics: {
    totalRefunds: number;
    refundCount: number;
    refundRate: number;
    averageRefundAmount: number;
  };
}

export interface RevenueParams {
  period: string; // 'today', 'week', 'month', 'year'
  granularity: string; // 'hour', 'day', 'week', 'month'
}

// ==========================================
// ORDER ANALYTICS TYPES
// ==========================================
export interface OrderAnalytics {
  period: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    completedOrders: number;
  };
  statusDistribution: Array<{
    status: string;
    count: number;
    revenue: number;
  }>;
  orderTrends: Array<{
    period: string;
    orders: number;
    revenue: number;
    completedOrders: number;
  }>;
  peakHours: Array<{
    hour: number;
    orders: number;
    period: string;
  }>;
  customerAnalytics: {
    totalSessions: number;
    sessionsWithOrders: number;
    conversionRate: number;
    repeatCustomers: number;
    repeatRate: number;
    averageSessionValue: number;
    // Added based on potential API response, but kept optional if unsure
  };
  tablePerformance: Array<{
    tableId: string;
    tableNumber: string;
    tableName: string | null;
    sessions: number;
    orders: number;
    revenue: number;
    averageOrderValue: number;
  }>;
}

export interface OrderParams {
  period: string;
  granularity: string;
}

// ==========================================
// POPULAR ITEMS TYPES
// ==========================================
export interface PopularItem {
  name: string;
  category: string;
  quantitySold: number;
  totalRevenue: number;
  orderFrequency?: number; // For mostFrequentItems
  growthRate?: number; // For trendingItems
  totalQuantity?: number; // For trendingItems
}

export interface PopularItemsAnalytics {
  topSellingItems: PopularItem[];
  topRevenueItems: PopularItem[];
  mostFrequentItems: PopularItem[];
  trendingItems: PopularItem[];
}

export interface PopularItemsParams {
  period: string;
  limit?: number;
}

// ==========================================
// HOOKS
// ==========================================

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

      const response = await ApiClient.get<{ analytics: RevenueAnalytics }>(
        `/staff/analytics/${restaurantId}/revenue?${queryParams.toString()}`
      );
      return response.data.analytics;
    },
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
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

      const response = await ApiClient.get<{ analytics: OrderAnalytics }>(
        `/staff/analytics/${restaurantId}/orders?${queryParams.toString()}`
      );
      return response.data.analytics;
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

      const response = await ApiClient.get<{
        analytics: PopularItemsAnalytics;
      }>(
        `/staff/analytics/${restaurantId}/popular-items?${queryParams.toString()}`
      );
      return response.data.analytics;
    },
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
  });
};
