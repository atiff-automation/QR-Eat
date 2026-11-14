'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

interface ProfitLossParams {
  restaurantId: string;
  startDate: Date;
  endDate: Date;
}

/**
 * The P&L API takes business dates, not instants. Format the picker's local
 * calendar date so a browser outside the restaurant timezone cannot shift the
 * selected day.
 */
function toBusinessDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    tax: number;
    service: number;
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
      startDate: toBusinessDate(startDate),
      endDate: toBusinessDate(endDate),
    }),
    queryFn: async () => {
      const response = await ApiClient.get<{
        success: boolean;
        report: ProfitLossData;
      }>('/api/admin/reports/profit-loss', {
        params: {
          restaurantId,
          startDate: toBusinessDate(startDate),
          endDate: toBusinessDate(endDate),
        },
      });
      return response.report;
    },
    enabled: !!restaurantId,
    staleTime: 30 * 60 * 1000, // 30 minutes (expensive calculation)
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false, // Don't refetch on tab switch
  });
}
