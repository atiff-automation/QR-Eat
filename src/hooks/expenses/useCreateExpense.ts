'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

interface CreateExpenseData {
  restaurantId: string;
  categoryId: string;
  amount: number;
  description: string;
  expenseDate: string;
  vendor?: string;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EWALLET';
  invoiceNumber?: string;
  notes?: string;
}

export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateExpenseData) => {
      return ApiClient.post('/api/admin/expenses', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      toast.success('Expense added successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create expense');
    },
  });
}
