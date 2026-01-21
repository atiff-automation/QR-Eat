'use client';

import { useQuery } from '@tanstack/react-query';

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
    queryKey: ['expense-categories', restaurantId],
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/expenses/categories?restaurantId=${restaurantId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      return response.json();
    },
    staleTime: Infinity, // Categories rarely change
    enabled: !!restaurantId,
  });
}
