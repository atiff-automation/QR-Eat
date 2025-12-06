/**
 * Zod validation schemas for RLS tenant context
 * Ensures type safety and runtime validation
 */

import { z } from 'zod';
import { USER_TYPES, VALID_USER_TYPES } from './rls-constants';

// ============================================
// TENANT CONTEXT SCHEMA
// ============================================

export const TenantContextSchema = z.object({
  restaurantId: z.string().min(1, 'Restaurant ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  userType: z.enum([
    USER_TYPES.PLATFORM_ADMIN,
    USER_TYPES.RESTAURANT_OWNER,
    USER_TYPES.STAFF,
    USER_TYPES.CUSTOMER,
  ] as const),
  ownerId: z.string().optional(),
  customerSessionToken: z.string().optional(),
});

export type TenantContext = z.infer<typeof TenantContextSchema>;

// ============================================
// REQUEST HEADERS SCHEMA
// ============================================

export const TenantHeadersSchema = z.object({
  restaurantId: z.string().nullable(),
  userId: z.string().nullable(),
  userType: z.string().nullable(),
  ownerId: z.string().nullable(),
  isAdmin: z.string().nullable(),
});

// ============================================
// CUSTOMER CONTEXT SCHEMA
// ============================================

export const CustomerContextSchema = z.object({
  restaurantId: z.string().min(1, 'Restaurant ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
});

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate user type string against allowed values
 */
export function validateUserType(userType: string): boolean {
  return VALID_USER_TYPES.includes(userType);
}

/**
 * Parse and validate tenant context with Zod
 * @throws ZodError if validation fails
 */
export function parseTenantContext(data: unknown): TenantContext {
  return TenantContextSchema.parse(data);
}

/**
 * Safe parse tenant context (returns error instead of throwing)
 */
export function safeParseTenantContext(data: unknown) {
  return TenantContextSchema.safeParse(data);
}
