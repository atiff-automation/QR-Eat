'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

interface ProfitLossParams {
  restaurantId: string;
  startDate: Date;
  endDate: Date;
}

interface ProfitLossData {
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  revenue: {
    grossSales: number;
    discounts: number;
    refunds: number;
    netSales: number;
  };
  cogs: {
    breakdown: Array<{
      categoryName: string;
      amount: number;
      percentage: number;
    }>;
    totalCOGS: number;
    cogsPercentage: number;
  };
  grossProfit: {
    amount: number;
    margin: number;
  };
  operatingExpenses: {
    breakdown: Array<{
      categoryName: string;
      amount: number;
      percentage: number;
    }>;
    totalOperatingExpenses: number;
    opexPercentage: number;
  };
  netProfit: {
    amount: number;
    margin: number;
  };
  keyMetrics: {
    foodCostPercentage: number;
    laborCostPercentage: number;
    primeCost: number;
    primeCostPercentage: number;
    breakEvenRevenue: number;
  };
}

export function useProfitLoss({
  restaurantId,
  startDate,
  endDate,
}: ProfitLossParams) {
  return useQuery<ProfitLossData>({
    queryKey: queryKeys.profitLoss.report({
      restaurantId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }),
    queryFn: async () => {
      return ApiClient.get<ProfitLossData>('/api/admin/reports/profit-loss', {
        params: {
          restaurantId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
    },
    staleTime: 30 * 60 * 1000, // 30 minutes (expensive calculation)
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false, // Don't refetch on tab switch
  });
}
