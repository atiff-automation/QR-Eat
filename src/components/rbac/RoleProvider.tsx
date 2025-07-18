/**
 * Role Context Provider for RBAC System
 *
 * This component provides role and permission context throughout the application,
 * implementing Phase 3.1.1 of the RBAC Implementation Plan.
 *
 * Features:
 * - User role and permission state management
 * - Role switching capabilities
 * - Permission checking utilities
 * - Session management integration
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { UserRole, RestaurantContext } from '@/lib/rbac/types';

interface RoleContextType {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    mustChangePassword?: boolean;
  } | null;
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

export function useRole(): RoleContextType {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RoleContextType['user']>(null);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restaurantContext, setRestaurantContext] =
    useState<RestaurantContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserInfo = async () => {
    try {
      console.log('🔍 RoleProvider: Fetching user info from /api/auth/me');
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      console.log(
        '🔍 RoleProvider: Response status:',
        response.status,
        'Response:',
        data
      );

      if (response.ok) {
        console.log('✅ RoleProvider: User info loaded successfully');
        console.log(
          '🔍 RoleProvider: mustChangePassword value:',
          data.user?.mustChangePassword
        );

        setUser(data.user);
        setCurrentRole(data.currentRole);
        setAvailableRoles(data.availableRoles);
        setPermissions(data.permissions);
        setSessionId(data.session?.id);
        setRestaurantContext(data.restaurantContext);

        // Check if user must change password and redirect if necessary
        if (data.user?.mustChangePassword) {
          console.log(
            '🔐 RoleProvider: User must change password, checking current page'
          );
          if (
            typeof window !== 'undefined' &&
            !window.location.pathname.includes('/change-password') &&
            !window.location.pathname.includes('/login')
          ) {
            console.log('🔄 RoleProvider: Redirecting to change password page');
            window.location.href = '/change-password';
            return;
          }
        }
      } else {
        // Handle authentication errors
        console.error(
          '❌ RoleProvider: Failed to fetch user info:',
          data.error
        );

        // Only redirect to login if not already on login page
        if (
          typeof window !== 'undefined' &&
          !window.location.pathname.includes('/login')
        ) {
          console.log('🔄 RoleProvider: Redirecting to login');
          window.location.href = '/login';
        }
      }
    } catch (error) {
      console.error('❌ RoleProvider: Error fetching user info:', error);

      // Only redirect to login if not already on login page
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.includes('/login')
      ) {
        console.log('🔄 RoleProvider: Redirecting to login due to error');
        window.location.href = '/login';
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchRole = async (roleId: string): Promise<void> => {
    try {
      const response = await fetch('/api/auth/switch-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newRoleId: roleId }),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentRole(data.user.currentRole);
        setPermissions(data.user.permissions);
        setRestaurantContext(data.restaurant);

        // Refresh the page to reload data with new role context
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      } else {
        throw new Error(data.error || 'Role switch failed');
      }
    } catch (error) {
      console.error('Role switch error:', error);
      throw error;
    }
  };

  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (requiredPermissions: string[]): boolean => {
    return requiredPermissions.some((permission) =>
      permissions.includes(permission)
    );
  };

  const hasAllPermissions = (requiredPermissions: string[]): boolean => {
    return requiredPermissions.every((permission) =>
      permissions.includes(permission)
    );
  };

  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    await fetchUserInfo();
  };

  useEffect(() => {
    fetchUserInfo();
  }, []);

  const contextValue: RoleContextType = {
    user,
    currentRole,
    availableRoles,
    permissions,
    sessionId,
    restaurantContext,
    isLoading,
    switchRole,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refresh,
  };

  return (
    <RoleContext.Provider value={contextValue}>{children}</RoleContext.Provider>
  );
}
