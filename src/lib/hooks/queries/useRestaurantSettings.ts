/**
 * Restaurant Settings Hooks - TanStack Query
 *
 * Provides hooks for fetching and updating restaurant settings.
 * Replaces the legacy RestaurantContext with proper cache management.
 *
 * Features:
 * - Automatic cache invalidation
 * - Optimistic updates
 * - Auto-refresh on window focus
 * - Type-safe queries and mutations
 *
 * @see tanstack_implementation_plan.md Phase 1
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

/**
 * Restaurant Settings Interface
 * Matches the structure from RestaurantContext
 */
export interface RestaurantSettings {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  email: string;
  description: string | null;
  timezone: string;
  currency: string;
  taxRate: string; // Decimal returned as string
  serviceChargeRate: string; // Decimal returned as string
  taxLabel: string;
  serviceChargeLabel: string;
  operatingHours: Record<string, unknown>;
  notificationSettings: {
    soundEnabled: boolean;
    soundType: string;
    orderAlerts: boolean;
    desktopNotifications: boolean;
  };
  receiptSettings: {
    headerText: string;
    footerText: string;
    paperSize: string;
  };
  paymentMethods: {
    cash: boolean;
    card: boolean;
    ewallet: boolean;
  };
  systemPreferences: {
    dateFormat: string;
    timeFormat: string;
    numberFormat: string;
    language: string;
  };
}

/**
 * Fetch restaurant settings
 *
 * @returns Query result with restaurant settings
 *
 * @example
 * ```tsx
 * const { data: settings, isLoading, error } = useRestaurantSettings();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error />;
 *
 * return <div>Currency: {settings.currency}</div>;
 * ```
 */
export function useRestaurantSettings() {
  return useQuery({
    queryKey: queryKeys.restaurants.settings,
    queryFn: async () => {
      const data = await ApiClient.get<{ settings: RestaurantSettings }>(
        '/settings/restaurant'
      );
      return data.settings;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * Payload for updating restaurant settings
 * Allows numbers for rates which are strings in the fetch response
 */
export interface UpdateRestaurantSettingsPayload {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  description?: string;
  currency?: string;
  taxRate?: number | string;
  serviceChargeRate?: number | string;
  taxLabel?: string;
  serviceChargeLabel?: string;
  operatingHours?: Record<string, unknown>;
  notificationSettings?: RestaurantSettings['notificationSettings'];
  receiptSettings?: RestaurantSettings['receiptSettings'];
  paymentMethods?: RestaurantSettings['paymentMethods'];
  systemPreferences?: RestaurantSettings['systemPreferences'];
}

/**
 * Update restaurant settings
 *
 * Features:
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 * - Rollback on error
 *
 * @returns Mutation object
 *
 * @example
 * ```tsx
 * const updateSettings = useUpdateRestaurantSettings();
 *
 * const handleSave = async () => {
 *   await updateSettings.mutateAsync({ currency: 'SGD' });
 *   // ✅ All components auto-update!
 * };
 * ```
 */
export function useUpdateRestaurantSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: UpdateRestaurantSettingsPayload) => {
      return ApiClient.put('/settings/restaurant', settings);
    },
    onMutate: async (newSettings) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.restaurants.settings,
      });

      // Snapshot previous value
      const previousSettings = queryClient.getQueryData<RestaurantSettings>(
        queryKeys.restaurants.settings
      );

      // Optimistically update
      // We need to handle the potential type mismatch for optimistic updates
      // (API accepts numbers, but cache stores strings for Decimals)
      if (previousSettings) {
        const optimisticUpdate = {
          ...newSettings,
        } as Partial<RestaurantSettings>;

        // Convert numbers to strings for the cache to match Read shape
        if (typeof newSettings.taxRate === 'number') {
          optimisticUpdate.taxRate = newSettings.taxRate.toString();
        }
        if (typeof newSettings.serviceChargeRate === 'number') {
          optimisticUpdate.serviceChargeRate =
            newSettings.serviceChargeRate.toString();
        }

        queryClient.setQueryData<RestaurantSettings>(
          queryKeys.restaurants.settings,
          { ...previousSettings, ...optimisticUpdate }
        );
      }

      return { previousSettings };
    },
    onError: (err, newSettings, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(
          queryKeys.restaurants.settings,
          context.previousSettings
        );
      }
    },
    onSuccess: () => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.restaurants.settings,
      });
    },
  });
}

/**
 * Convenience hook to get just the currency
 *
 * @returns Current currency code (e.g., 'MYR', 'SGD')
 *
 * @example
 * ```tsx
 * const currency = useCurrency();
 * return <div>{currency}</div>; // 'MYR'
 * ```
 */
export function useCurrency(): string {
  const { data } = useRestaurantSettings();
  return data?.currency || 'MYR';
}

/**
 * Convenience hook to get tax rate
 *
 * @returns Tax rate as number
 */
export function useTaxRate(): number {
  const { data } = useRestaurantSettings();
  return data?.taxRate ? parseFloat(data.taxRate) : 0;
}

/**
 * Convenience hook to get service charge rate
 *
 * @returns Service charge rate as number
 */
export function useServiceChargeRate(): number {
  const { data } = useRestaurantSettings();
  return data?.serviceChargeRate ? parseFloat(data.serviceChargeRate) : 0;
}

/**
 * Convenience hook to get payment methods
 *
 * @returns Payment methods configuration
 */
export function usePaymentMethods() {
  const { data } = useRestaurantSettings();
  return (
    data?.paymentMethods || {
      cash: true,
      card: true,
      ewallet: true,
    }
  );
}
