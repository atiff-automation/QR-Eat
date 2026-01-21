'use client';

import { useQuery } from '@tanstack/react-query';

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
  const queryParams = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, String(value));
    }
  });

  return useQuery<ExpensesResponse>({
    queryKey: ['expenses', filters],
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/expenses?${queryParams.toString()}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch expenses');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!filters.restaurantId,
  });
}
