'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

interface Expense {
  id: string;
  amount: number;
  description: string;
  expenseDate: string;
  vendor: string | null;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EWALLET';
  invoiceNumber: string | null;
  notes: string | null;
  category: {
    id: string;
    name: string;
    categoryType: 'COGS' | 'OPERATING' | 'OTHER';
  };
  createdAt: string;
  updatedAt: string;
}

interface ExpensesResponse {
  success: boolean;
  expenses: Expense[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface ExpenseFilters {
  restaurantId: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useExpenses(filters: ExpenseFilters) {
  const params: Record<string, string | number | boolean | undefined> = {};

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = value as string | number;
    }
  });

  return useQuery<ExpensesResponse>({
    queryKey: queryKeys.expenses.list(
      filters as unknown as Record<string, unknown>
    ),
    queryFn: async () => {
      return ApiClient.get<ExpensesResponse>('/api/admin/expenses', { params });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!filters.restaurantId,
  });
}
