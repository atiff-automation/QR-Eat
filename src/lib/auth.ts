import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Staff, StaffRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export interface JWTPayload {
  staffId: string;
  email: string;
  username: string;
  restaurantId: string;
  roleId: string;
  permissions: Record<string, string[]>;
  iat?: number;
  exp?: number;
}

export interface StaffWithRole extends Staff {
  role: StaffRole;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  static async verifyPassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  static generateToken(staff: StaffWithRole): string {
    const payload: JWTPayload = {
      staffId: staff.id,
      email: staff.email,
      username: staff.username,
      restaurantId: staff.restaurantId,
      roleId: staff.roleId,
      permissions: staff.role.permissions as Record<string, string[]>,
    };

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
      staffId: payload.staffId,
      email: payload.email,
      username: payload.username,
      restaurantId: payload.restaurantId,
      roleId: payload.roleId,
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
