/**
 * Role Management System for RBAC
 *
 * This file implements role template management and role switching functionality
 * for the enhanced RBAC system.
 */

import { prisma } from '@/lib/database';
import {
  UserRole,
  RoleTemplate,
  RoleSwitchRequest,
  RoleSwitchResult,
  UserType,
  RBAC_CONSTANTS,
  RBACError,
  RoleSwitchError,
  isValidRoleTemplate,
  isValidUserType,
} from './types';
import { PermissionManager } from './permissions';

export class RoleManager {
  /**
   * Get all available role templates
   */
  static async getAllRoleTemplates(): Promise<RoleTemplate[]> {
    return [...RBAC_CONSTANTS.ROLE_TEMPLATES];
  }

  /**
   * Get role template permissions
   */
  static async getRoleTemplatePermissions(
    template: RoleTemplate
  ): Promise<string[]> {
    return await PermissionManager.getTemplatePermissions(template);
  }

  /**
   * Get user's available roles
   */
  static async getUserRoles(userId: string): Promise<UserRole[]> {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Filter out roles for inactive restaurants
      const activeRoles = userRoles.filter(
        (role) => !role.restaurantId || role.restaurant?.isActive
      );

      return activeRoles.map((role) => ({
        id: role.id,
        userType: role.userType as UserType,
        roleTemplate: role.roleTemplate,
        restaurantId: role.restaurantId || undefined,
        customPermissions: role.customPermissions as string[],
        isActive: role.isActive,
      }));
    } catch {
      throw new RBACError(
        'Failed to get user roles',
        'GET_USER_ROLES_FAILED',
        500
      );
    }
  }

  /**
   * Get user's active role for a specific restaurant
   */
  static async getUserRoleForRestaurant(
    userId: string,
    restaurantId: string
  ): Promise<UserRole | null> {
    try {
      const userRole = await prisma.userRole.findFirst({
        where: {
          userId,
          restaurantId,
          isActive: true,
        },
        include: {
          restaurant: {
            select: {
              isActive: true,
            },
          },
        },
      });

      if (!userRole || !userRole.restaurant?.isActive) {
        return null;
      }

      return {
        id: userRole.id,
        userType: userRole.userType as UserType,
        roleTemplate: userRole.roleTemplate,
        restaurantId: userRole.restaurantId || undefined,
        customPermissions: userRole.customPermissions as string[],
        isActive: userRole.isActive,
      };
    } catch {
      throw new RBACError(
        'Failed to get user role for restaurant',
        'GET_RESTAURANT_ROLE_FAILED',
        500
      );
    }
  }

  /**
   * Create a new user role
   */
  static async createUserRole(
    userId: string,
    userType: UserType,
    roleTemplate: RoleTemplate,
    restaurantId?: string,
    customPermissions?: string[]
  ): Promise<UserRole> {
    try {
      // Validate inputs
      if (!isValidUserType(userType)) {
        throw new RBACError(
          `Invalid user type: ${userType}`,
          'INVALID_USER_TYPE',
          400
        );
      }

      if (!isValidRoleTemplate(roleTemplate)) {
        throw new RBACError(
          `Invalid role template: ${roleTemplate}`,
          'INVALID_ROLE_TEMPLATE',
          400
        );
      }

      // Platform admin roles should not have restaurant context
      if (userType === UserType.PLATFORM_ADMIN && restaurantId) {
        throw new RBACError(
          'Platform admin roles cannot have restaurant context',
          'INVALID_PLATFORM_ADMIN_ROLE',
          400
        );
      }

      // Staff and restaurant owner roles must have restaurant context
      if (userType !== UserType.PLATFORM_ADMIN && !restaurantId) {
        throw new RBACError(
          'Staff and restaurant owner roles must have restaurant context',
          'MISSING_RESTAURANT_CONTEXT',
          400
        );
      }

      // Check if user already has a role for this restaurant
      if (restaurantId) {
        const existingRole = await prisma.userRole.findFirst({
          where: {
            userId,
            restaurantId,
            isActive: true,
          },
        });

        if (existingRole) {
          throw new RBACError(
            'User already has an active role for this restaurant',
            'ROLE_ALREADY_EXISTS',
            409
          );
        }
      }

      // Validate restaurant exists and is active
      if (restaurantId) {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { isActive: true },
        });

        if (!restaurant || !restaurant.isActive) {
          throw new RBACError(
            'Restaurant not found or inactive',
            'RESTAURANT_NOT_FOUND',
            404
          );
        }
      }

      // Create the role
      const userRole = await prisma.userRole.create({
        data: {
          userId,
          userType,
          roleTemplate,
          restaurantId,
          customPermissions: customPermissions || [],
          isActive: true,
        },
      });

      // Clear permission cache for this user
      PermissionManager.clearUserCache(userId);

      return {
        id: userRole.id,
        userType: userRole.userType as UserType,
        roleTemplate: userRole.roleTemplate,
        restaurantId: userRole.restaurantId || undefined,
        customPermissions: userRole.customPermissions as string[],
        isActive: userRole.isActive,
      };
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to create user role',
        'CREATE_USER_ROLE_FAILED',
        500
      );
    }
  }

  /**
   * Update user role
   */
  static async updateUserRole(
    roleId: string,
    updates: {
      roleTemplate?: RoleTemplate;
      customPermissions?: string[];
      isActive?: boolean;
    }
  ): Promise<UserRole> {
    try {
      const existingRole = await prisma.userRole.findUnique({
        where: { id: roleId },
      });

      if (!existingRole) {
        throw new RBACError(`Role not found: ${roleId}`, 'ROLE_NOT_FOUND', 404);
      }

      // Validate role template if provided
      if (updates.roleTemplate && !isValidRoleTemplate(updates.roleTemplate)) {
        throw new RBACError(
          `Invalid role template: ${updates.roleTemplate}`,
          'INVALID_ROLE_TEMPLATE',
          400
        );
      }

      const updatedRole = await prisma.userRole.update({
        where: { id: roleId },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
      });

      // Clear permission cache for this user
      PermissionManager.clearUserCache(existingRole.userId);

      return {
        id: updatedRole.id,
        userType: updatedRole.userType as UserType,
        roleTemplate: updatedRole.roleTemplate,
        restaurantId: updatedRole.restaurantId || undefined,
        customPermissions: updatedRole.customPermissions as string[],
        isActive: updatedRole.isActive,
      };
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to update user role',
        'UPDATE_USER_ROLE_FAILED',
        500
      );
    }
  }

  /**
   * Delete user role
   */
  static async deleteUserRole(roleId: string): Promise<void> {
    try {
      const existingRole = await prisma.userRole.findUnique({
        where: { id: roleId },
      });

      if (!existingRole) {
        throw new RBACError(`Role not found: ${roleId}`, 'ROLE_NOT_FOUND', 404);
      }

      // Check if this is the user's only role
      const userRoleCount = await prisma.userRole.count({
        where: {
          userId: existingRole.userId,
          isActive: true,
        },
      });

      if (userRoleCount === 1) {
        throw new RBACError(
          "Cannot delete user's only role",
          'CANNOT_DELETE_ONLY_ROLE',
          400
        );
      }

      // Soft delete by setting isActive to false
      await prisma.userRole.update({
        where: { id: roleId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Clear permission cache for this user
      PermissionManager.clearUserCache(existingRole.userId);

      // Invalidate any active sessions for this role
      await prisma.userSession.deleteMany({
        where: { currentRoleId: roleId },
      });
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to delete user role',
        'DELETE_USER_ROLE_FAILED',
        500
      );
    }
  }

  /**
   * Switch user role (for multi-role users)
   */
  static async switchUserRole(
    request: RoleSwitchRequest
  ): Promise<RoleSwitchResult> {
    try {
      const { userId, targetRoleId, currentSessionId, restaurantContextId } =
        request;

      // Validate target role exists and belongs to user
      const targetRole = await prisma.userRole.findFirst({
        where: {
          id: targetRoleId,
          userId,
          isActive: true,
        },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              timezone: true,
              currency: true,
            },
          },
        },
      });

      if (!targetRole) {
        throw new RoleSwitchError('Target role not found or not accessible');
      }

      // Check if restaurant is active (for restaurant-scoped roles)
      if (targetRole.restaurantId && !targetRole.restaurant?.isActive) {
        throw new RoleSwitchError('Restaurant is inactive');
      }

      // Validate restaurant context if provided
      if (restaurantContextId) {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantContextId },
          select: { isActive: true },
        });

        if (!restaurant || !restaurant.isActive) {
          throw new RoleSwitchError('Restaurant context not found or inactive');
        }
      }

      // Update current session with new role
      await prisma.userSession.updateMany({
        where: { sessionId: currentSessionId },
        data: {
          currentRoleId: targetRoleId,
          restaurantContextId: restaurantContextId || targetRole.restaurantId,
          lastActivity: new Date(),
        },
      });

      // Clear permission cache for this user
      PermissionManager.clearUserCache(userId);

      return {
        success: true,
        newRole: {
          id: targetRole.id,
          userType: targetRole.userType as UserType,
          roleTemplate: targetRole.roleTemplate,
          restaurantId: targetRole.restaurantId || undefined,
          customPermissions: targetRole.customPermissions as string[],
          isActive: targetRole.isActive,
        },
      };
    } catch (error) {
      if (error instanceof RBACError) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: 'Role switch failed',
      };
    }
  }

  /**
   * Get role template definition
   */
  static async getRoleTemplateDefinition(template: RoleTemplate): Promise<{
    template: RoleTemplate;
    permissions: string[];
    description: string;
  }> {
    try {
      if (!isValidRoleTemplate(template)) {
        throw new RBACError(
          `Invalid role template: ${template}`,
          'INVALID_ROLE_TEMPLATE',
          400
        );
      }

      const permissions =
        await PermissionManager.getTemplatePermissions(template);

      // Get description based on template
      const descriptions: Record<string, string> = {
        platform_admin: 'Platform administrator with full system access',
        restaurant_owner:
          'Restaurant owner with full restaurant control and staff management',
        manager:
          'Restaurant manager with operational access, no staff management',
        kitchen_staff:
          'Kitchen staff with order management and kitchen display access',
        waiter: 'Waiter with order entry access', // Added default for waiter if present in RoleTemplate
        busser: 'Busser with table clearing access',
        bartender: 'Bartender with bar order access',
      };

      return {
        template,
        permissions,
        description: descriptions[template],
      };
    } catch (error) {
      if (error instanceof RBACError) {
        throw error;
      }
      throw new RBACError(
        'Failed to get role template definition',
        'GET_ROLE_TEMPLATE_FAILED',
        500
      );
    }
  }

  /**
   * Validate role assignment
   */
  static async validateRoleAssignment(
    userId: string,
    userType: UserType,
    roleTemplate: RoleTemplate,
    restaurantId?: string
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check if user exists
      let userExists = false;

      switch (userType) {
        case UserType.PLATFORM_ADMIN:
          userExists = !!(await prisma.platformAdmin.findUnique({
            where: { id: userId },
          }));
          break;
        case UserType.RESTAURANT_OWNER:
          userExists = !!(await prisma.restaurantOwner.findUnique({
            where: { id: userId },
          }));
          break;
        case UserType.STAFF:
          userExists = !!(await prisma.staff.findUnique({
            where: { id: userId },
          }));
          break;
      }

      if (!userExists) {
        errors.push('User not found');
      }

      // Validate user type and role template compatibility
      const compatibilityMap = {
        [UserType.PLATFORM_ADMIN]: ['platform_admin'],
        [UserType.RESTAURANT_OWNER]: ['restaurant_owner'],
        [UserType.STAFF]: ['manager', 'kitchen_staff'],
      };

      if (!compatibilityMap[userType].includes(roleTemplate)) {
        errors.push(
          `Role template ${roleTemplate} not compatible with user type ${userType}`
        );
      }

      // Validate restaurant context
      if (userType === UserType.PLATFORM_ADMIN && restaurantId) {
        errors.push('Platform admin roles cannot have restaurant context');
      }

      if (userType !== UserType.PLATFORM_ADMIN && !restaurantId) {
        errors.push('Non-platform admin roles must have restaurant context');
      }

      if (restaurantId) {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { isActive: true },
        });

        if (!restaurant) {
          errors.push('Restaurant not found');
        } else if (!restaurant.isActive) {
          errors.push('Restaurant is inactive');
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch {
      errors.push('Validation failed');
      return {
        isValid: false,
        errors,
      };
    }
  }

  /**
   * Get role statistics
   */
  static async getRoleStatistics(): Promise<{
    totalRoles: number;
    rolesByType: Record<string, number>;
    rolesByTemplate: Record<string, number>;
    activeRoles: number;
    inactiveRoles: number;
  }> {
    try {
      const roles = await prisma.userRole.findMany({
        select: {
          userType: true,
          roleTemplate: true,
          isActive: true,
        },
      });

      const rolesByType: Record<string, number> = {};
      const rolesByTemplate: Record<string, number> = {};
      let activeRoles = 0;
      let inactiveRoles = 0;

      roles.forEach((role) => {
        // Count by user type
        rolesByType[role.userType] = (rolesByType[role.userType] || 0) + 1;

        // Count by template
        rolesByTemplate[role.roleTemplate] =
          (rolesByTemplate[role.roleTemplate] || 0) + 1;

        // Count by status
        if (role.isActive) {
          activeRoles++;
        } else {
          inactiveRoles++;
        }
      });

      return {
        totalRoles: roles.length,
        rolesByType,
        rolesByTemplate,
        activeRoles,
        inactiveRoles,
      };
    } catch {
      throw new RBACError(
        'Failed to get role statistics',
        'GET_ROLE_STATISTICS_FAILED',
        500
      );
    }
  }
}
