'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClient } from '@/lib/api-client';
import { AUTH_ROUTES } from '@/lib/auth-routes';

interface AccessControlProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
  allowedRoles?: string[];
  redirectTo?: string;
}

export function AccessControl({
  children,
  requiredPermissions = [],
  allowedRoles = [],
  redirectTo = '/dashboard/kitchen',
}: AccessControlProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const data = await ApiClient.get<{
          user: {
            userType: string;
            mustChangePassword?: boolean;
          };
          currentRole: {
            roleTemplate: string;
          };
          permissions: string[];
        }>('/auth/me');
        const userData = data.user;
        const currentRole = data.currentRole;
        const userPermissions = data.permissions || [];

        // Always allow restaurant owners
        if (userData.userType === 'restaurant_owner') {
          setAuthorized(true);
          return;
        }

        // For staff, check permissions and roles
        if (userData.userType === 'staff') {
          // Kitchen staff should be redirected to kitchen display
          if (
            currentRole &&
            currentRole.roleTemplate &&
            currentRole.roleTemplate.toLowerCase() === 'kitchen_staff'
          ) {
            router.replace('/kitchen');
            return;
          }

          // Check if role is allowed
          const roleAllowed =
            allowedRoles.length === 0 ||
            allowedRoles.some(
              (allowedRole) =>
                currentRole &&
                currentRole.roleTemplate &&
                currentRole.roleTemplate
                  .toLowerCase()
                  .includes(allowedRole.toLowerCase())
            );

          // Check if has required permissions
          const hasPermissions =
            requiredPermissions.length === 0 ||
            requiredPermissions.every((permission) =>
              userPermissions.includes(permission)
            );

          if (roleAllowed && hasPermissions) {
            setAuthorized(true);
          } else {
            // Redirect based on their role template
            if (currentRole.roleTemplate.toLowerCase() === 'kitchen_staff') {
              router.replace('/kitchen');
            } else {
              router.replace(redirectTo);
            }
            return;
          }
        } else {
          // Other user types not allowed
          router.replace(AUTH_ROUTES.LOGIN);
          return;
        }
      } catch (error) {
        console.error('Access check failed:', error);
        router.replace(AUTH_ROUTES.LOGIN);
        return;
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [router, requiredPermissions, allowedRoles, redirectTo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking access...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null; // Will be redirected
  }

  return <>{children}</>;
}
