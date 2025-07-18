/**
 * RBAC Components Export Index
 * 
 * Centralized exports for all RBAC UI components implementing
 * Phase 3 of the RBAC Implementation Plan.
 */

// Core Context Provider
export { RoleProvider, useRole } from './RoleProvider';

// Permission Guards
export { 
  PermissionGuard, 
  AdminOnly, 
  OwnerOnly, 
  StaffOnly, 
  ManagerOnly, 
  KitchenOnly 
} from './PermissionGuard';

// Role Switching Components
export { RoleSwitcher, CompactRoleSwitcher } from './RoleSwitcher';

// Re-export types for convenience
export type { UserRole, RestaurantContext } from '@/lib/rbac/types';