import * as bcrypt from 'bcryptjs';
import {
  Staff,
  StaffRole,
  PlatformAdmin,
  RestaurantOwner,
} from '@prisma/client';
import { prisma } from './database';
import { SecurityUtils } from './security';

export enum UserType {
  PLATFORM_ADMIN = 'platform_admin',
  RESTAURANT_OWNER = 'restaurant_owner',
  STAFF = 'staff',
}

export interface JWTPayload {
  userId: string;
  userType: UserType;
  email: string;
  username?: string;
  restaurantId?: string;
  roleId?: string;
  ownerId?: string;
  permissions: Record<string, string[]>;
  iat?: number;
  exp?: number;
}

export interface StaffWithRole extends Staff {
  role: StaffRole;
}

export interface RestaurantOwnerWithRestaurants extends RestaurantOwner {
  restaurants: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  }>;
}

export interface StaffWithRoleAndRestaurant extends Staff {
  role: StaffRole;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  };
}

export type AuthenticatedUser =
  | { type: UserType.PLATFORM_ADMIN; user: PlatformAdmin }
  | { type: UserType.RESTAURANT_OWNER; user: RestaurantOwnerWithRestaurants }
  | { type: UserType.STAFF; user: StaffWithRoleAndRestaurant };

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    // Validate password strength before hashing
    const validation = SecurityUtils.validatePasswordStrength(password);
    if (!validation.isValid) {
      throw new Error(
        `Password validation failed: ${validation.errors.join(', ')}`
      );
    }
    return bcrypt.hash(password, 12);
  }

  static async verifyPassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * REMOVED - This method has been fully replaced by RBAC system
   * Use: EnhancedJWTService.generateToken from @/lib/rbac/auth-service
   * Migration Date: 2025-12-16
   */

  /**
   * REMOVED - This method has been fully replaced by RBAC system
   * Use: AuthServiceV2.validateToken from @/lib/rbac/auth-service
   * Migration Date: 2025-12-16
   */

  /**
   * REMOVED - This method has been fully replaced by RBAC system
   * Use: EnhancedJWTService.refreshToken from @/lib/rbac/auth-service
   * Migration Date: 2025-12-16
   */

  static hasPermission(
    permissions: Record<string, string[]>,
    resource: string,
    action: string
  ): boolean {
    const resourcePermissions = permissions[resource];
    return resourcePermissions ? resourcePermissions.includes(action) : false;
  }

  static extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Find user by email across all user types (platform admin, restaurant owner, staff)
   */
  static async findUserByEmail(
    email: string
  ): Promise<AuthenticatedUser | null> {
    const normalizedEmail = email.toLowerCase();

    // Try platform admin first
    const platformAdmin = await prisma.platformAdmin.findUnique({
      where: { email: normalizedEmail },
    });

    if (platformAdmin) {
      return {
        type: UserType.PLATFORM_ADMIN,
        user: platformAdmin,
      };
    }

    // Try restaurant owner
    const restaurantOwner = await prisma.restaurantOwner.findUnique({
      where: { email: normalizedEmail },
      include: {
        restaurants: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
    });

    if (restaurantOwner) {
      return {
        type: UserType.RESTAURANT_OWNER,
        user: restaurantOwner,
      };
    }

    // Try staff - include restaurant info to check if restaurant is active
    const staff = await prisma.staff.findUnique({
      where: { email: normalizedEmail },
      include: {
        role: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
    });

    if (staff) {
      return {
        type: UserType.STAFF,
        user: staff,
      };
    }

    return null;
  }

  /**
   * Authenticate user with email and password
   */
  static async authenticateUser(
    email: string,
    password: string
  ): Promise<AuthenticatedUser | null> {
    const user = await this.findUserByEmail(email);
    if (!user) return null;

    // Check if account is active
    if (!user.user.isActive) return null;

    // For staff, check if their restaurant is active - block login if restaurant is inactive
    if (user.type === UserType.STAFF) {
      if (!user.user.restaurant.isActive) {
        throw new Error(
          'Restaurant is inactive. Please contact your restaurant owner or administrator.'
        );
      }
    }

    // For restaurant owners, we allow login but will handle password change in the UI
    // This is different from staff who are completely blocked

    // Check if account is locked (for platform admin and restaurant owner)
    if (
      'lockedUntil' in user.user &&
      user.user.lockedUntil &&
      user.user.lockedUntil > new Date()
    ) {
      return null;
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(
      password,
      user.user.passwordHash
    );
    if (!isValidPassword) return null;

    return user;
  }
}

/**
 * DEPRECATED: Legacy AUTH_CONSTANTS - DO NOT USE IN NEW CODE
 *
 * All legacy cookie names have been replaced with 'qr_rbac_token'
 * Migration completed: 2025-12-16
 *
 * This object is kept ONLY for:
 * 1. Debug endpoint reference
 * 2. Old documentation
 * 3. Migration tracking
 *
 * Use RBAC_CONSTANTS from @/lib/rbac/types instead
 */
export const AUTH_CONSTANTS = {
  COOKIE_NAME: 'qr_auth_token', // REMOVED - Use 'qr_rbac_token'
  OWNER_COOKIE_NAME: 'qr_owner_token', // REMOVED - Use 'qr_rbac_token'
  STAFF_COOKIE_NAME: 'qr_staff_token', // REMOVED - Use 'qr_rbac_token'
  ADMIN_COOKIE_NAME: 'qr_admin_token', // REMOVED - Use 'qr_rbac_token'
  HEADER_NAME: 'authorization', // Still valid for debug purposes
  SESSION_DURATION: '24h', // REMOVED - See RBAC system
  MAX_LOGIN_ATTEMPTS: 5, // REMOVED - See RBAC system
  LOCKOUT_DURATION: 15 * 60 * 1000, // REMOVED - See RBAC system
} as const;

/**
 * REMOVED FUNCTION: getCookieNameForUserType
 * Fully replaced by RBAC unified token system
 * Migration Date: 2025-12-16
 */

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN', // Allow iframe within same domain (for staff ordering modal)
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
} as const;

export interface AuthVerificationResult {
  isValid: boolean;
  user?: AuthenticatedUser;
  payload?: JWTPayload;
  error?: string;
  // Backward compatibility - deprecated, use user instead
  staff?: StaffWithRole;
}

/**
 * REMOVED FUNCTION: verifyAuthToken
 *
 * Fully replaced by: AuthServiceV2.validateToken from @/lib/rbac/auth-service
 * Migration Date: 2025-12-16
 *
 * Previous functionality:
 * - Multi-cookie token lookup (qr_auth_token, qr_owner_token, qr_staff_token, qr_admin_token)
 * - Legacy JWT validation
 * - User lookup and activity tracking
 *
 * New RBAC equivalent:
 * const validation = await AuthServiceV2.validateToken(token);
 * if (validation.isValid && validation.user) { // use validation.user }
 */
