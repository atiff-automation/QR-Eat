/**
 * Permission Guard Component for RBAC System
 * 
 * This component provides permission-based conditional rendering,
 * implementing Phase 3.1.2 of the RBAC Implementation Plan.
 * 
 * Features:
 * - Single permission checking
 * - Multiple permission checking (any/all)
 * - Fallback content for unauthorized access
 * - Convenience components for common roles
 */

'use client';

import { ReactNode } from 'react';
import { useRole } from './RoleProvider';

interface PermissionGuardProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGuard({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useRole();
  
  let hasAccess = false;
  
  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = requireAll 
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  } else {
    // If no permissions specified, allow access
    hasAccess = true;
  }
  
  if (!hasAccess) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

// Convenience components for common permission patterns
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard permission="admin:access" fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function OwnerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard permission="restaurants:write" fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function StaffOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard permissions={['orders:read', 'tables:read']} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

// Additional convenience components for granular permissions
export function ManagerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard permissions={['staff:write', 'analytics:read']} requireAll fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function KitchenOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard permission="orders:kitchen" fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}