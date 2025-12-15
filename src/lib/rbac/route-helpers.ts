/**
 * RBAC Route Helpers
 * 
 * Shared utilities for API routes using RBAC authentication.
 * Follows CLAUDE.md principles: Type Safety, Error Handling, DRY
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from './auth-service';
import { EnhancedAuthenticatedUser } from './types';
import { AuditLogger } from './audit-logger';
import { prisma } from '@/lib/database';

/**
 * Authentication result from RBAC validation
 */
export interface RBACAuthResult {
    success: boolean;
    user?: EnhancedAuthenticatedUser;
    error?: {
        message: string;
        status: number;
    };
}

/**
 * Validate RBAC token from request cookies
 * Includes audit logging for failed attempts
 */
export async function validateRBACToken(request: NextRequest): Promise<RBACAuthResult> {
    const token = request.cookies.get('qr_rbac_token')?.value;

    if (!token) {
        await AuditLogger.logSecurityEvent(
            'anonymous',
            'MISSING_TOKEN',
            'low',
            'API request without authentication token',
            {
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                userAgent: request.headers.get('user-agent') || 'unknown',
                metadata: {
                    path: request.nextUrl.pathname,
                    method: request.method
                }
            }
        );

        return {
            success: false,
            error: {
                message: 'Authentication required',
                status: 401
            }
        };
    }

    const validation = await AuthServiceV2.validateToken(token);

    if (!validation.isValid || !validation.user) {
        await AuditLogger.logSecurityEvent(
            'anonymous',
            'INVALID_TOKEN',
            'medium',
            'API request with invalid token',
            {
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                userAgent: request.headers.get('user-agent') || 'unknown',
                metadata: {
                    path: request.nextUrl.pathname,
                    method: request.method,
                    tokenPresent: !!token
                }
            }
        );

        return {
            success: false,
            error: {
                message: 'Invalid or expired token',
                status: 401
            }
        };
    }

    return {
        success: true,
        user: validation.user
    };
}

/**
 * Check if user has access to a specific restaurant
 * Handles platform admins, restaurant owners, and staff
 */
export async function checkRestaurantAccess(
    user: EnhancedAuthenticatedUser,
    restaurantId: string
): Promise<boolean> {
    try {
        // Platform admins have access to all restaurants
        if (user.currentRole.userType === 'platform_admin') {
            return true;
        }

        // Restaurant owners can access their own restaurants
        if (user.currentRole.userType === 'restaurant_owner') {
            const restaurant = await prisma.restaurant.findFirst({
                where: {
                    id: restaurantId,
                    ownerId: user.id
                }
            });
            return !!restaurant;
        }

        // Staff can access their assigned restaurant
        if (user.restaurantContext?.id === restaurantId) {
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error checking restaurant access:', error);
        await AuditLogger.logSecurityEvent(
            user.id,
            'ACCESS_CHECK_ERROR',
            'high',
            `Error checking restaurant access: ${error instanceof Error ? error.message : 'Unknown error'}`,
            {
                ipAddress: 'system',
                userAgent: 'system',
                metadata: {
                    restaurantId,
                    userId: user.id,
                    userType: user.currentRole.userType
                }
            }
        );
        return false;
    }
}

/**
 * Require specific permission from user
 */
export function hasPermission(
    user: EnhancedAuthenticatedUser,
    permission: string
): boolean {
    return user.permissions.includes(permission);
}

/**
 * Require user to have specific role type
 */
export function hasRoleType(
    user: EnhancedAuthenticatedUser,
    ...allowedTypes: Array<'platform_admin' | 'restaurant_owner' | 'staff'>
): boolean {
    return allowedTypes.includes(user.currentRole.userType as any);
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(message: string, status: number): NextResponse {
    return NextResponse.json(
        { success: false, error: message },
        { status }
    );
}

/**
 * Log access denied event with audit trail
 */
export async function logAccessDenied(
    user: EnhancedAuthenticatedUser,
    resource: string,
    reason: string,
    request: NextRequest
): Promise<void> {
    await AuditLogger.logSecurityEvent(
        user.id,
        'ACCESS_DENIED',
        'medium',
        `Access denied to ${resource}: ${reason}`,
        {
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
            metadata: {
                path: request.nextUrl.pathname,
                method: request.method,
                resource,
                reason,
                userType: user.currentRole.userType
            }
        }
    );
}
