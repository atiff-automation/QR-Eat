'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoryId: string) => {
      return ApiClient.delete<{ restaurantId: string }>(
        `/api/admin/expenses/categories/${categoryId}`
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.expenses.categories(data.restaurantId),
      });
      toast.success('Category deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete category');
    },
  });
}
