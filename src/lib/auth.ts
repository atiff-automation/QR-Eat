import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { Staff, StaffRole, PlatformAdmin, RestaurantOwner } from '@prisma/client';
import { prisma } from './prisma';
import { SecurityUtils } from './security';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export enum UserType {
  PLATFORM_ADMIN = 'platform_admin',
  RESTAURANT_OWNER = 'restaurant_owner',
  STAFF = 'staff'
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
  }>;
}

export type AuthenticatedUser = 
  | { type: UserType.PLATFORM_ADMIN; user: PlatformAdmin }
  | { type: UserType.RESTAURANT_OWNER; user: RestaurantOwnerWithRestaurants }
  | { type: UserType.STAFF; user: StaffWithRole };

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    // Validate password strength before hashing
    const validation = SecurityUtils.validatePasswordStrength(password);
    if (!validation.isValid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }
    return bcrypt.hash(password, 12);
  }

  static async verifyPassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  static generateToken(user: AuthenticatedUser): string {
    let payload: JWTPayload;

    switch (user.type) {
      case UserType.PLATFORM_ADMIN:
        payload = {
          userId: user.user.id,
          userType: UserType.PLATFORM_ADMIN,
          email: user.user.email,
          permissions: { 
            platform: ['read', 'write', 'delete', 'admin'],
            restaurants: ['read', 'write', 'delete'],
            users: ['read', 'write', 'delete'],
            billing: ['read', 'write'],
            analytics: ['read']
          },
        };
        break;

      case UserType.RESTAURANT_OWNER:
        payload = {
          userId: user.user.id,
          userType: UserType.RESTAURANT_OWNER,
          email: user.user.email,
          permissions: {
            restaurants: ['read', 'write'],
            staff: ['read', 'write', 'delete'],
            menu: ['read', 'write', 'delete'],
            orders: ['read', 'write'],
            analytics: ['read'],
            billing: ['read'],
            subscription: ['read', 'write']
          },
        };
        break;

      case UserType.STAFF:
        payload = {
          userId: user.user.id,
          userType: UserType.STAFF,
          email: user.user.email,
          username: user.user.username,
          restaurantId: user.user.restaurantId,
          roleId: user.user.roleId,
          permissions: user.user.role.permissions as Record<string, string[]>,
        };
        break;

      default:
        throw new Error('Invalid user type for token generation');
    }

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  static verifyToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  static async refreshToken(token: string): Promise<string | null> {
    const payload = this.verifyToken(token);
    if (!payload) return null;

    // Generate new token with same payload but fresh expiration
    const newPayload: JWTPayload = {
      userId: payload.userId,
      userType: payload.userType,
      email: payload.email,
      username: payload.username,
      restaurantId: payload.restaurantId,
      roleId: payload.roleId,
      ownerId: payload.ownerId,
      permissions: payload.permissions,
    };

    return jwt.sign(newPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

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
  static async findUserByEmail(email: string): Promise<AuthenticatedUser | null> {
    const normalizedEmail = email.toLowerCase();

    // Try platform admin first
    const platformAdmin = await prisma.platformAdmin.findUnique({
      where: { email: normalizedEmail }
    });

    if (platformAdmin) {
      return {
        type: UserType.PLATFORM_ADMIN,
        user: platformAdmin
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
            slug: true
          }
        }
      }
    });

    if (restaurantOwner) {
      return {
        type: UserType.RESTAURANT_OWNER,
        user: restaurantOwner
      };
    }

    // Try staff
    const staff = await prisma.staff.findUnique({
      where: { email: normalizedEmail },
      include: { role: true }
    });

    if (staff) {
      return {
        type: UserType.STAFF,
        user: staff
      };
    }

    return null;
  }

  /**
   * Authenticate user with email and password
   */
  static async authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.findUserByEmail(email);
    if (!user) return null;

    // Check if account is active
    if (!user.user.isActive) return null;

    // Check if account is locked (for platform admin and restaurant owner)
    if ('lockedUntil' in user.user && user.user.lockedUntil && user.user.lockedUntil > new Date()) {
      return null;
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.user.passwordHash);
    if (!isValidPassword) return null;

    return user;
  }
}

export const AUTH_CONSTANTS = {
  COOKIE_NAME: 'qr_auth_token',
  HEADER_NAME: 'authorization',
  SESSION_DURATION: '24h',
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes in milliseconds
} as const;

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
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

export async function verifyAuthToken(request: NextRequest): Promise<AuthVerificationResult> {
  try {
    // Log authentication attempt
    const ip = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Try to get token from cookie first, then from header
    let token = request.cookies.get(AUTH_CONSTANTS.COOKIE_NAME)?.value;
    
    if (!token) {
      const authHeader = request.headers.get(AUTH_CONSTANTS.HEADER_NAME);
      token = AuthService.extractTokenFromHeader(authHeader) || undefined;
    }

    if (!token) {
      SecurityUtils.logSecurityEvent('Authentication attempt without token', { ip, userAgent });
      return {
        isValid: false,
        error: 'No authentication token provided'
      };
    }

    // Verify the JWT token
    const payload = AuthService.verifyToken(token);
    if (!payload) {
      return {
        isValid: false,
        error: 'Invalid or expired token'
      };
    }

    let user: AuthenticatedUser | null = null;

    // Get user based on user type in payload
    switch (payload.userType) {
      case UserType.PLATFORM_ADMIN:
        const platformAdmin = await prisma.platformAdmin.findUnique({
          where: { id: payload.userId }
        });
        if (platformAdmin && platformAdmin.isActive) {
          user = { type: UserType.PLATFORM_ADMIN, user: platformAdmin };
          // Update last activity
          await prisma.platformAdmin.update({
            where: { id: platformAdmin.id },
            data: { lastLoginAt: new Date() }
          });
        }
        break;

      case UserType.RESTAURANT_OWNER:
        const restaurantOwner = await prisma.restaurantOwner.findUnique({
          where: { id: payload.userId },
          include: {
            restaurants: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        });
        if (restaurantOwner && restaurantOwner.isActive) {
          user = { type: UserType.RESTAURANT_OWNER, user: restaurantOwner };
          // Update last activity
          await prisma.restaurantOwner.update({
            where: { id: restaurantOwner.id },
            data: { lastLoginAt: new Date() }
          });
        }
        break;

      case UserType.STAFF:
        const staff = await prisma.staff.findUnique({
          where: { id: payload.userId },
          include: {
            role: true,
            restaurant: true
          }
        });
        if (staff && staff.isActive) {
          user = { type: UserType.STAFF, user: staff };
          // Update last activity
          await prisma.staff.update({
            where: { id: staff.id },
            data: { lastLoginAt: new Date() }
          });
        }
        break;

      default:
        return {
          isValid: false,
          error: 'Invalid user type in token'
        };
    }

    if (!user) {
      return {
        isValid: false,
        error: 'User not found or account is disabled'
      };
    }

    return {
      isValid: true,
      user,
      payload,
      // Backward compatibility: populate staff field if user is staff
      staff: user.type === UserType.STAFF ? user.user : undefined
    };

  } catch (error) {
    console.error('Auth verification error:', error);
    return {
      isValid: false,
      error: 'Authentication verification failed'
    };
  }
}
