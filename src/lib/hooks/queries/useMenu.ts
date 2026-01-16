/**
 * Menu Hooks - TanStack Query
 *
 * Provides hooks for fetching and managing menu items and categories.
 * Replaces manual state management with proper cache management.
 *
 * Features:
 * - Automatic cache invalidation
 * - Optimistic updates for instant UI feedback
 * - Auto-refresh on window focus
 * - No manual cache busting needed
 * - Type-safe queries and mutations
 *
 * @see tanstack_implementation_plan.md Phase 3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

/**
 * Menu Item Variation Interface
 */
export interface MenuItemVariation {
  id: string;
  name: string;
  priceModifier: number;
  variationType: string;
  isRequired: boolean;
  maxSelections?: number;
  displayOrder: number;
}

/**
 * Menu Item Interface
 */
export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  preparationTime: number;
  calories?: number;
  allergens: string[];
  dietaryInfo: string[];
  status: 'ACTIVE' | 'INACTIVE';
  isFeatured: boolean;
  displayOrder: number;
  categoryId?: string;
  category?: {
    id: string;
    name: string;
  };
  variations: MenuItemVariation[];
}

/**
 * Menu Category Interface
 */
export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  menuItems: MenuItem[];
  _count: {
    menuItems: number;
  };
}

/**
 * Fetch all menu categories with items
 *
 * @returns Query result with categories array
 *
 * @example
 * ```tsx
 * const { data: categories, isLoading, error } = useMenuCategories();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error />;
 *
 * return <CategoryList categories={categories} />;
 * ```
 */
export function useMenuCategories() {
  return useQuery({
    queryKey: queryKeys.menu.categories,
    queryFn: async () => {
      const data = await ApiClient.get<{ categories: MenuCategory[] }>(
        '/admin/menu/categories'
      );
      return data.categories;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (menu changes rarely)
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * Fetch all menu items
 *
 * @returns Query result with items array
 */
export function useMenuItems() {
  return useQuery({
    queryKey: queryKeys.menu.items,
    queryFn: async () => {
      const data = await ApiClient.get<{ items: MenuItem[] }>(
        '/admin/menu/items'
      );
      return data.items;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch a single menu item by ID
 *
 * @param itemId - Menu item ID to fetch
 * @returns Query result with item data
 */
export function useMenuItem(itemId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.menu.byId(itemId || ''),
    queryFn: async () => {
      if (!itemId) throw new Error('Item ID is required');

      const data = await ApiClient.get<{ item: MenuItem }>(
        `/admin/menu/items/${itemId}`
      );
      return data.item;
    },
    enabled: !!itemId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Create a new menu item
 *
 * @returns Mutation object
 *
 * @example
 * ```tsx
 * const createItem = useCreateMenuItem();
 *
 * const handleCreate = async (itemData) => {
 *   await createItem.mutateAsync(itemData);
 *   // ✅ Categories auto-refresh!
 * };
 * ```
 */
export function useCreateMenuItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemData: Partial<MenuItem>) => {
      return ApiClient.post('/admin/menu/items', itemData);
    },
    onSuccess: () => {
      // Invalidate both categories and items
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories });
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.items });
    },
  });
}

/**
 * Update an existing menu item
 *
 * Features:
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 * - Rollback on error
 *
 * @returns Mutation object
 */
export function useUpdateMenuItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...itemData
    }: Partial<MenuItem> & { id: string }) => {
      return ApiClient.patch(`/admin/menu/items/${id}`, itemData);
    },
    onMutate: async ({ id, ...updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.menu.categories });

      // Snapshot previous value
      const previousCategories = queryClient.getQueryData<MenuCategory[]>(
        queryKeys.menu.categories
      );

      // Optimistically update
      if (previousCategories) {
        queryClient.setQueryData<MenuCategory[]>(
          queryKeys.menu.categories,
          previousCategories.map((category) => ({
            ...category,
            menuItems: category.menuItems.map((item) =>
              item.id === id ? { ...item, ...updates } : item
            ),
          }))
        );
      }

      return { previousCategories };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.menu.categories,
          context.previousCategories
        );
      }
    },
    onSuccess: () => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories });
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.items });
    },
  });
}

/**
 * Toggle menu item status (ACTIVE/INACTIVE)
 *
 * Features:
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 * - Rollback on error
 *
 * @returns Mutation object
 */
export function useToggleItemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: 'ACTIVE' | 'INACTIVE';
    }) => {
      return ApiClient.patch(`/admin/menu/items/${id}`, { status });
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.menu.categories });

      const previousCategories = queryClient.getQueryData<MenuCategory[]>(
        queryKeys.menu.categories
      );

      if (previousCategories) {
        queryClient.setQueryData<MenuCategory[]>(
          queryKeys.menu.categories,
          previousCategories.map((category) => ({
            ...category,
            menuItems: category.menuItems.map((item) =>
              item.id === id ? { ...item, status } : item
            ),
          }))
        );
      }

      return { previousCategories };
    },
    onError: (err, variables, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.menu.categories,
          context.previousCategories
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories });
    },
  });
}

/**
 * Toggle category status (ACTIVE/INACTIVE)
 *
 * Features:
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 * - Rollback on error
 *
 * @returns Mutation object
 */
export function useToggleCategoryStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: 'ACTIVE' | 'INACTIVE';
    }) => {
      return ApiClient.patch(`/admin/menu/categories/${id}`, { status });
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.menu.categories });

      const previousCategories = queryClient.getQueryData<MenuCategory[]>(
        queryKeys.menu.categories
      );

      if (previousCategories) {
        queryClient.setQueryData<MenuCategory[]>(
          queryKeys.menu.categories,
          previousCategories.map((category) =>
            category.id === id ? { ...category, status } : category
          )
        );
      }

      return { previousCategories };
    },
    onError: (err, variables, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.menu.categories,
          context.previousCategories
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories });
    },
  });
}

/**
 * Delete a menu item
 *
 * @returns Mutation object
 */
export function useDeleteMenuItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return ApiClient.delete(`/admin/menu/items/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.menu.categories });

      const previousCategories = queryClient.getQueryData<MenuCategory[]>(
        queryKeys.menu.categories
      );

      // Optimistically remove from list
      if (previousCategories) {
        queryClient.setQueryData<MenuCategory[]>(
          queryKeys.menu.categories,
          previousCategories.map((category) => ({
            ...category,
            menuItems: category.menuItems.filter((item) => item.id !== id),
            _count: {
              menuItems: category.menuItems.filter((item) => item.id !== id)
                .length,
            },
          }))
        );
      }

      return { previousCategories };
    },
    onError: (err, variables, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.menu.categories,
          context.previousCategories
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories });
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.items });
    },
  });
}

/**
 * Create a new menu category
 *
 * @returns Mutation object
 */
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoryData: Partial<MenuCategory>) => {
      return ApiClient.post<{ category: MenuCategory }>(
        '/admin/menu/categories',
        categoryData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories });
    },
  });
}

/**
 * Update a menu category
 *
 * @returns Mutation object
 */
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...categoryData
    }: Partial<MenuCategory> & { id: string }) => {
      return ApiClient.patch(`/admin/menu/categories/${id}`, categoryData);
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.menu.categories });

      const previousCategories = queryClient.getQueryData<MenuCategory[]>(
        queryKeys.menu.categories
      );

      if (previousCategories) {
        queryClient.setQueryData<MenuCategory[]>(
          queryKeys.menu.categories,
          previousCategories.map((category) =>
            category.id === id ? { ...category, ...updates } : category
          )
        );
      }

      return { previousCategories };
    },
    onError: (err, variables, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.menu.categories,
          context.previousCategories
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories });
    },
  });
}

/**
 * Delete a menu category
 *
 * @returns Mutation object
 */
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return ApiClient.delete(`/admin/menu/categories/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.menu.categories });

      const previousCategories = queryClient.getQueryData<MenuCategory[]>(
        queryKeys.menu.categories
      );

      if (previousCategories) {
        queryClient.setQueryData<MenuCategory[]>(
          queryKeys.menu.categories,
          previousCategories.filter((category) => category.id !== id)
        );
      }

      return { previousCategories };
    },
    onError: (err, variables, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.menu.categories,
          context.previousCategories
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories });
    },
  });
}
