'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

interface UpdateExpenseData {
  categoryId?: string;
  amount?: number;
  description?: string;
  expenseDate?: string;
  vendor?: string | null;
  paymentMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EWALLET';
  invoiceNumber?: string | null;
  notes?: string | null;
}

export function useUpdateExpense(expenseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateExpenseData) => {
      return ApiClient.put(`/api/admin/expenses/${expenseId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      toast.success('Expense updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update expense');
    },
  });
}
