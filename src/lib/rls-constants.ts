/**
 * RLS (Row-Level Security) Constants
 * Single source of truth for tenant context configuration
 */

// ============================================
// USER TYPES (Single Source of Truth)
// ============================================

export const USER_TYPES = {
  PLATFORM_ADMIN: 'platform_admin',
  RESTAURANT_OWNER: 'restaurant_owner',
  STAFF: 'staff',
  CUSTOMER: 'customer',
} as const;

export type UserType = (typeof USER_TYPES)[keyof typeof USER_TYPES];

export const VALID_USER_TYPES: ReadonlyArray<string> =
  Object.values(USER_TYPES);

// ============================================
// HEADER NAMES (Single Source of Truth)
// ============================================

export const TENANT_HEADERS = {
  RESTAURANT_ID: 'x-restaurant-id',
  USER_ID: 'x-user-id',
  USER_TYPE: 'x-user-type',
  OWNER_ID: 'x-owner-id',
  IS_ADMIN: 'x-is-admin',
} as const;

// ============================================
// COOKIE NAMES (Single Source of Truth)
// ============================================

export const SESSION_COOKIES = {
  CUSTOMER: 'customer_session',
  STAFF: 'staff_session',
  OWNER: 'owner_session',
} as const;

// ============================================
// POSTGRESQL SESSION VARIABLES (Single Source of Truth)
// ============================================

export const PG_SESSION_VARS = {
  RESTAURANT_ID: 'app.current_restaurant_id',
  USER_ID: 'app.current_user_id',
  USER_TYPE: 'app.current_user_type',
  CUSTOMER_SESSION_TOKEN: 'app.customer_session_token',
} as const;

// ============================================
// DEFAULT VALUES (Single Source of Truth)
// ============================================

export const DEFAULT_VALUES = {
  ANONYMOUS_USER_ID: '00000000-0000-0000-0000-000000000000',
  EMPTY_RESTAURANT_ID: '',
} as const;

// ============================================
// ERROR MESSAGES (Single Source of Truth)
// ============================================

export const RLS_ERRORS = {
  MISSING_USER_TYPE:
    'Missing user type in request headers - authentication required',
  INVALID_USER_TYPE: 'Invalid user type',
  MISSING_RESTAURANT_CONTEXT:
    'Missing restaurant context - restaurant ID required for non-admin users',
  MISSING_USER_ID:
    'Missing user ID in request headers - authentication required',
  MISSING_CUSTOMER_SUBDOMAIN:
    'Missing restaurant context - customer must access via subdomain',
  MISSING_CUSTOMER_SESSION: 'Missing customer session - session token required',
  DATABASE_OPERATION_FAILED: 'Database operation failed',
} as const;
