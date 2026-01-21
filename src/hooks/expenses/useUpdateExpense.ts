'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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
      const response = await fetch(`/api/admin/expenses/${expenseId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update expense');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update expense');
    },
  });
}
