/**
 * Permission Constants - Single Source of Truth for All Permissions
 *
 * This file defines all permission strings used in the RBAC system.
 * Following CODING_STANDARDS.md:
 * - Single Source of Truth: All permissions defined in one place
 * - No Hardcoding: Import these constants instead of string literals
 * - Type Safety: Const objects provide autocomplete and typo prevention
 *
 * @see prisma/seed.ts for permission definitions and role mappings
 */

/**
 * Platform-level permissions (Super Admin only)
 */
export const PLATFORM_PERMISSIONS = {
  READ: 'platform:read',
  WRITE: 'platform:write',
  DELETE: 'platform:delete',
} as const;

/**
 * Restaurant management permissions
 */
export const RESTAURANT_PERMISSIONS = {
  // Single restaurant operations
  READ: 'restaurant:read',
  WRITE: 'restaurant:write',
  SETTINGS: 'restaurant:settings',

  // Multi-restaurant operations (Platform Admin)
  CREATE: 'restaurants:create',
  READ_ALL: 'restaurants:read',
  WRITE_ALL: 'restaurants:write',
  DELETE: 'restaurants:delete',
} as const;

/**
 * Order management permissions
 */
export const ORDER_PERMISSIONS = {
  READ: 'orders:read',
  WRITE: 'orders:write',
  KITCHEN: 'orders:kitchen',
  UPDATE: 'orders:update',
  FULFILL: 'orders:fulfill',
} as const;

/**
 * Table management permissions
 */
export const TABLE_PERMISSIONS = {
  READ: 'tables:read',
  WRITE: 'tables:write',
  QR: 'tables:qr',
} as const;

/**
 * Staff management permissions
 */
export const STAFF_PERMISSIONS = {
  READ: 'staff:read',
  WRITE: 'staff:write',
  INVITE: 'staff:invite',
  DELETE: 'staff:delete',
  ROLES: 'staff:roles',
} as const;

/**
 * Analytics and reporting permissions
 */
export const ANALYTICS_PERMISSIONS = {
  READ: 'analytics:read',
  EXPORT: 'analytics:export',
  PLATFORM: 'analytics:platform',
} as const;

/**
 * Menu management permissions
 */
export const MENU_PERMISSIONS = {
  READ: 'menu:read',
  WRITE: 'menu:write',
  DELETE: 'menu:delete',
} as const;

/**
 * Settings permissions
 */
export const SETTINGS_PERMISSIONS = {
  READ: 'settings:read',
  WRITE: 'settings:write',
  PLATFORM: 'settings:platform',
} as const;

/**
 * Billing permissions
 */
export const BILLING_PERMISSIONS = {
  READ: 'billing:read',
  WRITE: 'billing:write',
} as const;

/**
 * Subscription permissions
 */
export const SUBSCRIPTION_PERMISSIONS = {
  READ: 'subscriptions:read',
  WRITE: 'subscriptions:write',
} as const;

/**
 * User management permissions (Platform Admin)
 */
export const USER_PERMISSIONS = {
  READ: 'users:read',
  WRITE: 'users:write',
  DELETE: 'users:delete',
} as const;

/**
 * All permissions grouped by category
 * Useful for permission management UIs and documentation
 */
export const PERMISSIONS_BY_CATEGORY = {
  platform: PLATFORM_PERMISSIONS,
  restaurant: RESTAURANT_PERMISSIONS,
  orders: ORDER_PERMISSIONS,
  tables: TABLE_PERMISSIONS,
  staff: STAFF_PERMISSIONS,
  analytics: ANALYTICS_PERMISSIONS,
  menu: MENU_PERMISSIONS,
  settings: SETTINGS_PERMISSIONS,
  billing: BILLING_PERMISSIONS,
  subscriptions: SUBSCRIPTION_PERMISSIONS,
  users: USER_PERMISSIONS,
} as const;

/**
 * Type-safe permission string type
 * Ensures only valid permission strings are used
 */
export type Permission =
  | (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS]
  | (typeof RESTAURANT_PERMISSIONS)[keyof typeof RESTAURANT_PERMISSIONS]
  | (typeof ORDER_PERMISSIONS)[keyof typeof ORDER_PERMISSIONS]
  | (typeof TABLE_PERMISSIONS)[keyof typeof TABLE_PERMISSIONS]
  | (typeof STAFF_PERMISSIONS)[keyof typeof STAFF_PERMISSIONS]
  | (typeof ANALYTICS_PERMISSIONS)[keyof typeof ANALYTICS_PERMISSIONS]
  | (typeof MENU_PERMISSIONS)[keyof typeof MENU_PERMISSIONS]
  | (typeof SETTINGS_PERMISSIONS)[keyof typeof SETTINGS_PERMISSIONS]
  | (typeof BILLING_PERMISSIONS)[keyof typeof BILLING_PERMISSIONS]
  | (typeof SUBSCRIPTION_PERMISSIONS)[keyof typeof SUBSCRIPTION_PERMISSIONS]
  | (typeof USER_PERMISSIONS)[keyof typeof USER_PERMISSIONS];

/**
 * Helper to check if a string is a valid permission
 */
export function isValidPermission(
  permission: string
): permission is Permission {
  const allPermissions = Object.values(PERMISSIONS_BY_CATEGORY).flatMap(
    (category) => Object.values(category)
  );
  return allPermissions.includes(permission as Permission);
}
