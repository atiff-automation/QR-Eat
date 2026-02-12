'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

interface ExpenseSummary {
  total: number;
  cogs: number;
  operating: number;
  trend: {
    total: number;
    cogs: number;
    operating: number;
  };
}

export function useExpenseSummary(
  restaurantId: string,
  startDate: Date,
  endDate: Date
) {
  return useQuery<ExpenseSummary>({
    queryKey: queryKeys.expenses.summary({
      restaurantId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }),
    queryFn: async () => {
      return ApiClient.get<ExpenseSummary>('/api/admin/expenses/summary', {
        params: {
          restaurantId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!restaurantId,
  });
}
