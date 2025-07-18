/**
 * Enhanced RBAC Types for JWT System
 * 
 * This file defines the comprehensive type structure for the new RBAC system
 * that replaces the problematic multi-cookie authentication system.
 */

// Enhanced JWT Payload Structure
export interface EnhancedJWTPayload {
  // User Identity
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  
  // Role & Context
  currentRole: UserRole;
  availableRoles: UserRole[];
  restaurantContext?: RestaurantContext;
  
  // Permissions (computed)
  permissions: string[];
  
  // Session Management
  sessionId: string;
  
  // JWT Standard Claims
  iat: number;
  exp: number;
  iss: string;
  sub: string;
}

// User Role Definition
export interface UserRole {
  id: string;
  userType: 'restaurant_owner' | 'staff' | 'platform_admin';
  roleTemplate: string;
  restaurantId?: string;
  customPermissions?: string[];
  isActive: boolean;
}

// Restaurant Context for Multi-tenant Support
export interface RestaurantContext {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  timezone: string;
  currency: string;
}

// Permission Structure
export interface Permission {
  id: string;
  permissionKey: string;
  description: string;
  category: string;
  isActive: boolean;
}

// Role Template Definitions
export type RoleTemplate = 'platform_admin' | 'restaurant_owner' | 'manager' | 'kitchen_staff';

// User Types
export enum UserType {
  PLATFORM_ADMIN = 'platform_admin',
  RESTAURANT_OWNER = 'restaurant_owner',
  STAFF = 'staff'
}

// Session Management
export interface UserSession {
  id: string;
  userId: string;
  sessionId: string;
  currentRoleId: string;
  restaurantContextId?: string;
  jwtTokenHash?: string;
  permissions: string[];
  expiresAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
}

// Enhanced Authentication Result
export interface EnhancedAuthResult {
  isValid: boolean;
  user?: EnhancedAuthenticatedUser;
  payload?: EnhancedJWTPayload;
  session?: UserSession;
  error?: string;
}

// Enhanced User Authentication Types
export interface EnhancedAuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: UserType;
  currentRole: UserRole;
  availableRoles: UserRole[];
  restaurantContext?: RestaurantContext;
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  mustChangePassword?: boolean;
}

// Permission Check Types
export interface PermissionCheck {
  hasPermission(permission: string): boolean;
  hasAnyPermission(permissions: string[]): boolean;
  hasAllPermissions(permissions: string[]): boolean;
  canAccessResource(resource: string, action: string): boolean;
}

// Role Switching Types
export interface RoleSwitchRequest {
  userId: string;
  targetRoleId: string;
  currentSessionId: string;
  restaurantContextId?: string;
}

export interface RoleSwitchResult {
  success: boolean;
  newToken?: string;
  newRole?: UserRole;
  error?: string;
}

// Audit Log Types
export interface RBACLogEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  fromRole?: string;
  toRole?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// JWT Configuration
export interface JWTConfig {
  secret: string;
  expiresIn: string;
  issuer: string;
  algorithm: 'HS256' | 'HS384' | 'HS512';
}

// Database Models (matching Prisma schema)
export interface UserRoleModel {
  id: string;
  userId: string;
  userType: string;
  restaurantId?: string;
  roleTemplate: string;
  customPermissions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionModel {
  id: string;
  permissionKey: string;
  description: string;
  category: string;
  isActive: boolean;
  createdAt: Date;
}

export interface RolePermissionModel {
  id: string;
  roleTemplate: string;
  permissionKey: string;
  grantedAt: Date;
}

export interface UserSessionModel {
  id: string;
  userId: string;
  sessionId: string;
  currentRoleId: string;
  restaurantContextId?: string;
  jwtTokenHash?: string;
  permissions: string[];
  expiresAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Error Types
export class RBACError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'RBACError';
  }
}

export class PermissionDeniedError extends RBACError {
  constructor(permission: string, resource?: string) {
    super(
      `Permission denied: ${permission}${resource ? ` for resource ${resource}` : ''}`,
      'PERMISSION_DENIED',
      403
    );
  }
}

export class InvalidTokenError extends RBACError {
  constructor(reason: string) {
    super(`Invalid token: ${reason}`, 'INVALID_TOKEN', 401);
  }
}

export class SessionExpiredError extends RBACError {
  constructor() {
    super('Session has expired', 'SESSION_EXPIRED', 401);
  }
}

export class RoleSwitchError extends RBACError {
  constructor(reason: string) {
    super(`Role switch failed: ${reason}`, 'ROLE_SWITCH_FAILED', 400);
  }
}

// Constants
export const RBAC_CONSTANTS = {
  // JWT Configuration
  JWT_ISSUER: 'qr-restaurant-system',
  JWT_ALGORITHM: 'HS256' as const,
  JWT_EXPIRES_IN: '24h',
  
  // Session Configuration
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  SESSION_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour cleanup interval
  
  // Permission Categories
  PERMISSION_CATEGORIES: [
    'platform',
    'restaurant',
    'orders',
    'tables',
    'staff',
    'analytics',
    'menu',
    'settings',
    'billing',
    'subscriptions',
    'users'
  ] as const,
  
  // Role Templates
  ROLE_TEMPLATES: [
    'platform_admin',
    'restaurant_owner',
    'manager',
    'kitchen_staff'
  ] as const,
  
  // User Types
  USER_TYPES: [
    'platform_admin',
    'restaurant_owner',
    'staff'
  ] as const,
  
  // Audit Actions
  AUDIT_ACTIONS: [
    'LOGIN',
    'LOGOUT',
    'ROLE_SWITCH',
    'PERMISSION_DENIED',
    'TOKEN_REFRESH',
    'SESSION_EXPIRED'
  ] as const
} as const;

// Type Guards
export function isValidUserType(userType: string): userType is UserType {
  return Object.values(UserType).includes(userType as UserType);
}

export function isValidRoleTemplate(template: string): template is RoleTemplate {
  return RBAC_CONSTANTS.ROLE_TEMPLATES.includes(template as RoleTemplate);
}

export function isEnhancedJWTPayload(payload: any): payload is EnhancedJWTPayload {
  return (
    payload &&
    typeof payload.userId === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.firstName === 'string' &&
    typeof payload.lastName === 'string' &&
    payload.currentRole &&
    Array.isArray(payload.availableRoles) &&
    Array.isArray(payload.permissions) &&
    typeof payload.sessionId === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    typeof payload.iss === 'string' &&
    typeof payload.sub === 'string'
  );
}