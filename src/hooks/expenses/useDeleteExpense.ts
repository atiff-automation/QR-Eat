'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expenseId: string) => {
      return ApiClient.delete(`/api/admin/expenses/${expenseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      toast.success('Expense deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete expense');
    },
  });
}
