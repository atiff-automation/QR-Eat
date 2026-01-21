'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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
      const response = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create expense');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense added successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create expense');
    },
  });
}
