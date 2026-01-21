'use client';

import { useQuery } from '@tanstack/react-query';

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
    queryKey: ['expense-summary', restaurantId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        restaurantId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const response = await fetch(`/api/admin/expenses/summary?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch expense summary');
      }
      return response.json();
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!restaurantId,
  });
}
