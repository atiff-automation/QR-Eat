/**
 * Permission Management System for RBAC
 * 
 * This file implements the permission computation and validation logic
 * for the enhanced RBAC system.
 */

import { prisma } from '../prisma';
import {
  Permission,
  UserRole,
  PermissionCheck,
  RoleTemplate,
  RBAC_CONSTANTS,
  RBACError,
  PermissionDeniedError,
  isValidRoleTemplate
} from './types';

// Permission cache for better performance
interface PermissionCache {
  templatePermissions: Map<string, string[]>;
  userPermissions: Map<string, { permissions: string[]; timestamp: number }>;
}

const cache: PermissionCache = {
  templatePermissions: new Map(),
  userPermissions: new Map()
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

export class PermissionManager {
  /**
   * Compute all permissions for a user based on their roles
   */
  static async computeUserPermissions(userId: string): Promise<string[]> {
    try {
      // Check cache first
      const cached = cache.userPermissions.get(userId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.permissions;
      }

      // Get user's active roles
      const userRoles = await prisma.userRole.findMany({
        where: { userId, isActive: true },
        include: {
          restaurant: {
            select: {
              id: true,
              isActive: true
            }
          }
        }
      });

      // Filter out roles for inactive restaurants
      const activeRoles = userRoles.filter(role => 
        !role.restaurantId || role.restaurant?.isActive
      );

      const permissions = new Set<string>();

      for (const role of activeRoles) {
        // Add template permissions
        const templatePermissions = await this.getTemplatePermissions(role.roleTemplate);
        templatePermissions.forEach(p => permissions.add(p));

        // Add custom permissions
        if (role.customPermissions && Array.isArray(role.customPermissions)) {
          (role.customPermissions as string[]).forEach(p => permissions.add(p));
        }
      }

      const result = Array.from(permissions);

      // Cache the result
      cache.userPermissions.set(userId, {
        permissions: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      throw new RBACError(
        'Failed to compute user permissions',
        'PERMISSION_COMPUTATION_FAILED',
        500
      );
    }
  }

  /**
   * Get permissions for a specific role template
   */
  static async getTemplatePermissions(template: string): Promise<string[]> {
    try {
      if (!isValidRoleTemplate(template)) {
        throw new RBACError(
          `Invalid role template: ${template}`,
          'INVALID_ROLE_TEMPLATE',
          400
        );
      }

      // Check cache first
      const cached = cache.templatePermissions.get(template);
      if (cached) {
        return cached;
      }

      const rolePermissions = await prisma.rolePermission.findMany({
        where: { roleTemplate: template },
        include: { 
          permission: true
        }
      });

      const permissions = rolePermissions
        .filter(rp => rp.permission.isActive)
        .map(rp => rp.permission.permissionKey);

      // Cache the result
      cache.templatePermissions.set(template, permissions);

      return permissions;
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to get template permissions',
        'TEMPLATE_PERMISSIONS_FAILED',
        500
      );
    }
  }

  /**
   * Check if user has a specific permission
   */
  static hasPermission(userPermissions: string[], requiredPermission: string): boolean {
    return userPermissions.includes(requiredPermission);
  }

  /**
   * Check if user has any of the required permissions
   */
  static hasAnyPermission(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );
  }

  /**
   * Check if user has all required permissions
   */
  static hasAllPermissions(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
  }

  /**
   * Check if user can access a resource with specific action
   */
  static canAccessResource(
    userPermissions: string[], 
    resource: string, 
    action: string
  ): boolean {
    const permissionKey = `${resource}:${action}`;
    return this.hasPermission(userPermissions, permissionKey);
  }

  /**
   * Get user's permissions for a specific category
   */
  static getPermissionsByCategory(
    userPermissions: string[], 
    category: string
  ): string[] {
    return userPermissions.filter(permission => 
      permission.startsWith(`${category}:`)
    );
  }

  /**
   * Get all available permissions
   */
  static async getAllPermissions(): Promise<Permission[]> {
    try {
      const permissions = await prisma.permission.findMany({
        where: { isActive: true },
        orderBy: [
          { category: 'asc' },
          { permissionKey: 'asc' }
        ]
      });

      return permissions.map(p => ({
        id: p.id,
        permissionKey: p.permissionKey,
        description: p.description,
        category: p.category,
        isActive: p.isActive
      }));
    } catch (error) {
      throw new RBACError(
        'Failed to get all permissions',
        'GET_PERMISSIONS_FAILED',
        500
      );
    }
  }

  /**
   * Get permissions by category
   */
  static async getPermissionsByCategoryStatic(category: string): Promise<Permission[]> {
    try {
      if (!RBAC_CONSTANTS.PERMISSION_CATEGORIES.includes(category as any)) {
        throw new RBACError(
          `Invalid permission category: ${category}`,
          'INVALID_PERMISSION_CATEGORY',
          400
        );
      }

      const permissions = await prisma.permission.findMany({
        where: { 
          category,
          isActive: true 
        },
        orderBy: { permissionKey: 'asc' }
      });

      return permissions.map(p => ({
        id: p.id,
        permissionKey: p.permissionKey,
        description: p.description,
        category: p.category,
        isActive: p.isActive
      }));
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to get permissions by category',
        'GET_CATEGORY_PERMISSIONS_FAILED',
        500
      );
    }
  }

  /**
   * Add custom permission to user role
   */
  static async addCustomPermission(
    roleId: string, 
    permission: string
  ): Promise<void> {
    try {
      // Validate permission exists
      const permissionExists = await prisma.permission.findFirst({
        where: { 
          permissionKey: permission,
          isActive: true 
        }
      });

      if (!permissionExists) {
        throw new RBACError(
          `Permission does not exist: ${permission}`,
          'PERMISSION_NOT_FOUND',
          404
        );
      }

      // Get current role
      const role = await prisma.userRole.findUnique({
        where: { id: roleId }
      });

      if (!role) {
        throw new RBACError(
          `Role not found: ${roleId}`,
          'ROLE_NOT_FOUND',
          404
        );
      }

      // Add permission to custom permissions
      const currentPermissions = role.customPermissions as string[] || [];
      if (!currentPermissions.includes(permission)) {
        currentPermissions.push(permission);
        
        await prisma.userRole.update({
          where: { id: roleId },
          data: {
            customPermissions: currentPermissions,
            updatedAt: new Date()
          }
        });

        // Clear cache for this user
        cache.userPermissions.delete(role.userId);
      }
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to add custom permission',
        'ADD_CUSTOM_PERMISSION_FAILED',
        500
      );
    }
  }

  /**
   * Remove custom permission from user role
   */
  static async removeCustomPermission(
    roleId: string, 
    permission: string
  ): Promise<void> {
    try {
      const role = await prisma.userRole.findUnique({
        where: { id: roleId }
      });

      if (!role) {
        throw new RBACError(
          `Role not found: ${roleId}`,
          'ROLE_NOT_FOUND',
          404
        );
      }

      // Remove permission from custom permissions
      const currentPermissions = role.customPermissions as string[] || [];
      const updatedPermissions = currentPermissions.filter(p => p !== permission);
      
      if (updatedPermissions.length !== currentPermissions.length) {
        await prisma.userRole.update({
          where: { id: roleId },
          data: {
            customPermissions: updatedPermissions,
            updatedAt: new Date()
          }
        });

        // Clear cache for this user
        cache.userPermissions.delete(role.userId);
      }
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to remove custom permission',
        'REMOVE_CUSTOM_PERMISSION_FAILED',
        500
      );
    }
  }

  /**
   * Clear permission cache
   */
  static clearCache(): void {
    cache.templatePermissions.clear();
    cache.userPermissions.clear();
  }

  /**
   * Clear cache for specific user
   */
  static clearUserCache(userId: string): void {
    cache.userPermissions.delete(userId);
  }

  /**
   * Clear cache for specific template
   */
  static clearTemplateCache(template: string): void {
    cache.templatePermissions.delete(template);
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    templateCache: number;
    userCache: number;
    cacheHits: number;
  } {
    return {
      templateCache: cache.templatePermissions.size,
      userCache: cache.userPermissions.size,
      cacheHits: 0 // TODO: Implement cache hit tracking
    };
  }
}

/**
 * Permission checker utility class
 */
export class PermissionChecker implements PermissionCheck {
  constructor(private userPermissions: string[]) {}

  hasPermission(permission: string): boolean {
    return PermissionManager.hasPermission(this.userPermissions, permission);
  }

  hasAnyPermission(permissions: string[]): boolean {
    return PermissionManager.hasAnyPermission(this.userPermissions, permissions);
  }

  hasAllPermissions(permissions: string[]): boolean {
    return PermissionManager.hasAllPermissions(this.userPermissions, permissions);
  }

  canAccessResource(resource: string, action: string): boolean {
    return PermissionManager.canAccessResource(this.userPermissions, resource, action);
  }

  /**
   * Assert permission - throws error if not authorized
   */
  assertPermission(permission: string): void {
    if (!this.hasPermission(permission)) {
      throw new PermissionDeniedError(permission);
    }
  }

  /**
   * Assert any permission - throws error if none are authorized
   */
  assertAnyPermission(permissions: string[]): void {
    if (!this.hasAnyPermission(permissions)) {
      throw new PermissionDeniedError(permissions.join(' or '));
    }
  }

  /**
   * Assert all permissions - throws error if any are missing
   */
  assertAllPermissions(permissions: string[]): void {
    if (!this.hasAllPermissions(permissions)) {
      const missing = permissions.filter(p => !this.hasPermission(p));
      throw new PermissionDeniedError(missing.join(', '));
    }
  }

  /**
   * Assert resource access - throws error if not authorized
   */
  assertResourceAccess(resource: string, action: string): void {
    if (!this.canAccessResource(resource, action)) {
      throw new PermissionDeniedError(`${resource}:${action}`, resource);
    }
  }
}

/**
 * Permission utilities
 */
export const PermissionUtils = {
  /**
   * Parse permission key into resource and action
   */
  parsePermissionKey(permissionKey: string): { resource: string; action: string } {
    const [resource, action] = permissionKey.split(':');
    return { resource, action };
  },

  /**
   * Create permission key from resource and action
   */
  createPermissionKey(resource: string, action: string): string {
    return `${resource}:${action}`;
  },

  /**
   * Validate permission key format
   */
  isValidPermissionKey(permissionKey: string): boolean {
    const pattern = /^[a-z_]+:[a-z_]+$/;
    return pattern.test(permissionKey);
  },

  /**
   * Get unique resources from permission list
   */
  getResourcesFromPermissions(permissions: string[]): string[] {
    const resources = new Set<string>();
    permissions.forEach(permission => {
      const { resource } = this.parsePermissionKey(permission);
      resources.add(resource);
    });
    return Array.from(resources);
  },

  /**
   * Get actions for a resource from permission list
   */
  getActionsForResource(permissions: string[], resource: string): string[] {
    return permissions
      .filter(permission => permission.startsWith(`${resource}:`))
      .map(permission => this.parsePermissionKey(permission).action);
  }
};

// Export for use in middleware and API routes
export const createPermissionChecker = (permissions: string[]): PermissionChecker => {
  return new PermissionChecker(permissions);
};