'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

interface CreateCategoryInput {
  restaurantId: string;
  name: string;
  categoryType: 'COGS' | 'OPERATING' | 'OTHER';
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCategoryInput) => {
      return ApiClient.post('/api/admin/expenses/categories', data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.expenses.categories(variables.restaurantId),
      });
      toast.success('Category created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create category');
    },
  });
}
