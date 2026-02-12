'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

interface Category {
  id: string;
  name: string;
  description: string | null;
  categoryType: 'COGS' | 'OPERATING' | 'OTHER';
  isSystem: boolean;
  displayOrder: number;
}

interface CategoriesResponse {
  success: boolean;
  categories: {
    COGS: Category[];
    OPERATING: Category[];
    OTHER: Category[];
  };
  total: number;
}

export function useCategories(restaurantId: string) {
  return useQuery<CategoriesResponse>({
    queryKey: queryKeys.expenses.categories(restaurantId),
    queryFn: async () => {
      return ApiClient.get<CategoriesResponse>(
        '/api/admin/expenses/categories',
        { params: { restaurantId } }
      );
    },
    staleTime: Infinity, // Categories rarely change
    enabled: !!restaurantId,
  });
}
