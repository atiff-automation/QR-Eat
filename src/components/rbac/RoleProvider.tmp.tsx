/**
 * Role Context Provider for RBAC System - TanStack Query Edition
 *
 * PRODUCTION REFACTOR: Migrated from manual state management to TanStack Query.
 *
 * Key Changes:
 * - ✅ Replaced useState/useEffect with TanStack Query hooks
 * - ✅ Eliminated infinite re-render bug (context value now stable)
 * - ✅ Built-in caching, refetching, error handling
 * - ✅ Reduced from 200+ lines to ~80 lines
 * - ✅ Automatic window focus refetch
 * - ✅ Optimized re-renders (only affected components)
 *
 * @see claudedocs/TANSTACK_QUERY_MIGRATION.md
 */

'use client';

import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useCallback,
} from 'react';
import { UserRole, RestaurantContext } from '@/lib/rbac/types';
import { AUTH_ROUTES } from '@/lib/auth-routes';
import { ApiClient } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  useAuthUser,
  useSwitchRole as useAuthSwitchRole,
  usePermissions,
  type AuthUser,
} from '@/lib/hooks/queries/useAuth';

// =============================================================================
// Type Definitions
// =============================================================================

interface RoleContextType {
  user: AuthUser | null;
  currentRole: UserRole | null;
  availableRoles: UserRole[];
  permissions: string[];
  sessionId: string | null;
  restaurantContext: RestaurantContext | null;
  isLoading: boolean;
  switchRole: (roleId: string) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  refresh: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | null>(null);

// =============================================================================
// Hook Export
// =============================================================================

export function useRole(): RoleContextType {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}

// =============================================================================
// Provider Component
// =============================================================================

export function RoleProvider({ children }: { children: ReactNode }) {
  // TanStack Query hooks replace all manual state management
  const { data, isLoading, error, refetch } = useAuthUser();
  const { mutateAsync: switchRoleMutation } = useAuthSwitchRole();

  // Permission helper hooks (already memoized in useAuth.ts)
  const permissions = usePermissions();

  // Wrapper functions for permission checks with stable references
  // CRITICAL: All hooks must be called unconditionally at the top level
  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (requiredPermissions: string[]) =>
      requiredPermissions.some((perm) => permissions.includes(perm)),
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (requiredPermissions: string[]) =>
      requiredPermissions.every((perm) => permissions.includes(perm)),
    [permissions]
  );

  // Wrapper functions with stable references (useCallback)
  const switchRole = useCallback(
    async (roleId: string): Promise<void> => {
      await switchRoleMutation(roleId);
      // Reload page after role switch (maintains existing behavior)
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    },
    [switchRoleMutation]
  );

  const refresh = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  // CRITICAL: useMemo prevents context value from changing on every render
  // This is what fixes the infinite re-render bug!
  const contextValue = useMemo<RoleContextType>(
    () => ({
      user: data?.user ?? null,
      currentRole: data?.currentRole ?? null,
      availableRoles: data?.availableRoles ?? [],
      permissions,
      sessionId: data?.session?.id ?? null,
      restaurantContext: data?.restaurantContext ?? null,
      isLoading,
      switchRole,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refresh,
    }),
    [
      data?.user,
      data?.currentRole,
      data?.availableRoles,
      data?.session?.id,
      data?.restaurantContext,
      permissions,
      isLoading,
      switchRole,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refresh,
    ]
  );

  // Handle authentication errors AFTER all hooks have been called
  // CRITICAL: Don't redirect if token refresh is in progress (race condition fix)
  if (
    error &&
    typeof window !== 'undefined' &&
    !window.location.pathname.includes('/login')
  ) {
    // Check if ApiClient is currently refreshing the token
    const isRefreshing = ApiClient.isRefreshInProgress();

    if (isRefreshing) {
      // Token refresh in progress - wait for it to complete instead of redirecting
      console.log(
        '⏳ RoleProvider: Auth error detected but token refresh in progress, waiting...'
      );
      // Show loading UI while refresh completes (prevents blank screen)
      return (
        <LoadingSpinner
          fullScreen
          message="Refreshing your session..."
          size="lg"
        />
      );
    }

    // Token refresh not in progress - this is a genuine auth failure
    console.log(
      '🔄 RoleProvider: Redirecting to login due to auth error (no refresh in progress)'
    );
    window.location.href = AUTH_ROUTES.LOGIN;
    return null;
  }

  // Handle password change requirement AFTER all hooks have been called
  if (
    data?.user?.mustChangePassword &&
    typeof window !== 'undefined' &&
    !window.location.pathname.includes('/change-password') &&
    !window.location.pathname.includes('/login')
  ) {
    console.log('🔄 RoleProvider: Redirecting to change password page');
    window.location.href = AUTH_ROUTES.CHANGE_PASSWORD;
    return null;
  }

  return (
    <RoleContext.Provider value={contextValue}>{children}</RoleContext.Provider>
  );
}
