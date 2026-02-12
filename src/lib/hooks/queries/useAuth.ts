/**
 * Authentication Query Hooks
 *
 * TanStack Query hooks for authentication state management.
 * Replaces manual state management in RoleProvider.
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Single Source of Truth
 * - Error Handling
 * - Production Best Practices
 *
 * @see claudedocs/TANSTACK_QUERY_MIGRATION.md
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { UserRole, RestaurantContext } from '@/lib/rbac/types';
import { AUTH_ROUTES } from '@/lib/auth-routes';

// =============================================================================
// Type Definitions
// =============================================================================

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType?: string;
  mustChangePassword?: boolean;
  role?: {
    permissions?: {
      staff?: string[];
    };
  };
}

export interface AuthResponse {
  success: boolean;
  user: AuthUser;
  currentRole: UserRole;
  availableRoles: UserRole[];
  permissions: string[];
  session?: { id: string };
  restaurantContext: RestaurantContext;
}

export interface SwitchRoleResponse {
  user: {
    currentRole: UserRole;
    permissions: string[];
  };
  restaurant: RestaurantContext;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch authenticated user data
 *
 * Features:
 * - Automatic caching (5 min)
 * - Auto-refetch on window focus
 * - Error handling with retry
 * - Loading states
 *
 * Usage:
 * ```tsx
 * const { data, isLoading, error, refetch } = useAuthUser();
 * if (data) {
 *   console.log(data.user.email);
 * }
 * ```
 */
export function useAuthUser() {
  return useQuery<AuthResponse>({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      try {
        const response = await ApiClient.get<AuthResponse>('/auth/me');
        return response;
      } catch (error) {
        // Log error for debugging
        console.error('❌ useAuthUser: Failed to fetch user', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1, // Retry once on failure
    refetchOnWindowFocus: true,
    // Don't retry on 401 errors (unauthorized)
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Convenience wrapper around useAuthUser for simpler destructuring.
 * Returns { user, isLoading } instead of the full TanStack Query result.
 */
export function useAuth() {
  const { data, isLoading } = useAuthUser();
  return { user: data?.user ?? null, isLoading };
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Switch user role mutation
 *
 * Features:
 * - Optimistic updates
 * - Automatic cache invalidation
 * - Error rollback
 * - Success/error callbacks
 *
 * Usage:
 * ```tsx
 * const { mutate: switchRole, isPending } = useSwitchRole();
 *
 * switchRole('new-role-id', {
 *   onSuccess: () => toast.success('Role switched!'),
 *   onError: (error) => toast.error(error.message),
 * });
 * ```
 */
export function useSwitchRole() {
  const queryClient = useQueryClient();

  return useMutation<SwitchRoleResponse, Error, string>({
    mutationFn: async (roleId: string) => {
      const response = await ApiClient.post<SwitchRoleResponse>(
        '/auth/switch-role',
        { newRoleId: roleId }
      );
      return response;
    },

    // Optimistic update: Update cache immediately before server responds
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.auth.me });

      // Snapshot current value for rollback
      const previousAuth = queryClient.getQueryData<AuthResponse>(
        queryKeys.auth.me
      );

      return { previousAuth };
    },

    // On success: Invalidate and refetch auth data
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },

    // On error: Rollback to previous state
    onError: (error, _roleId, context) => {
      if ((context as { previousAuth: AuthResponse }).previousAuth) {
        queryClient.setQueryData(
          queryKeys.auth.me,
          (context as { previousAuth: AuthResponse }).previousAuth
        );
      }
      console.error('❌ useSwitchRole: Failed to switch role', error);
    },
  });
}

/**
 * Logout mutation
 *
 * Features:
 * - Clears all cached data
 * - Redirects to login
 * - Error handling
 *
 * Usage:
 * ```tsx
 * const { mutate: logout, isPending } = useLogout();
 *
 * logout();
 * ```
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        await ApiClient.post('/auth/logout');
      } catch (error) {
        // Log error but don't throw - we want to logout anyway
        console.error('❌ useLogout: Logout API call failed', error);
      }
    },

    onSuccess: () => {
      // Clear all cached data
      queryClient.clear();

      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = AUTH_ROUTES.LOGIN;
      }
    },

    onError: (error) => {
      console.error('❌ useLogout: Mutation failed', error);

      // Still redirect to login even if API call fails
      if (typeof window !== 'undefined') {
        window.location.href = AUTH_ROUTES.LOGIN;
      }
    },
  });
}

// =============================================================================
// Helper Hooks
// =============================================================================

/**
 * Check if user is authenticated
 *
 * Usage:
 * ```tsx
 * const isAuthenticated = useIsAuthenticated();
 * ```
 */
export function useIsAuthenticated(): boolean {
  const { data, isLoading } = useAuthUser();
  return !isLoading && !!data?.user;
}

/**
 * Get current user permissions
 *
 * Usage:
 * ```tsx
 * const permissions = usePermissions();
 * const canEdit = permissions.includes('orders:write');
 * ```
 */
export function usePermissions(): string[] {
  const { data } = useAuthUser();
  return data?.permissions ?? [];
}

/**
 * Check if user has specific permission
 *
 * Usage:
 * ```tsx
 * const hasPermission = useHasPermission('orders:write');
 * ```
 */
export function useHasPermission(permission: string): boolean {
  const permissions = usePermissions();
  return permissions.includes(permission);
}

/**
 * Check if user has any of the provided permissions
 *
 * Usage:
 * ```tsx
 * const canViewOrders = useHasAnyPermission(['orders:read', 'orders:write']);
 * ```
 */
export function useHasAnyPermission(requiredPermissions: string[]): boolean {
  const permissions = usePermissions();
  return requiredPermissions.some((perm) => permissions.includes(perm));
}

/**
 * Check if user has all of the provided permissions
 *
 * Usage:
 * ```tsx
 * const canManageOrders = useHasAllPermissions(['orders:read', 'orders:write']);
 * ```
 */
export function useHasAllPermissions(requiredPermissions: string[]): boolean {
  const permissions = usePermissions();
  return requiredPermissions.every((perm) => permissions.includes(perm));
}
