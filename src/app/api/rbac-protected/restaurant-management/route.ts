/**
 * Example RBAC-Protected API Endpoint
 * 
 * This endpoint demonstrates how to use the RBAC middleware to protect API routes
 * with role-based access control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACMiddleware, rbacMiddlewareConfigs } from '@/middleware/rbac-middleware';
import { prisma } from '@/lib/database';

// GET /api/rbac-protected/restaurant-management
// Requires: restaurant_owner or platform_admin role
export async function GET(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['restaurant_owner', 'platform_admin'],
      requiredPermissions: ['restaurant:read'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 100 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    
    // Get restaurants based on user type
    let restaurants;
    
    if (context.user.userType === 'platform_admin') {
      // Platform admin can see all restaurants
      restaurants = await prisma.restaurant.findMany({
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              companyName: true
            }
          },
          _count: {
            select: {
              staff: true,
              menuItems: true,
              orders: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else if (context.user.userType === 'restaurant_owner') {
      // Restaurant owner can only see their own restaurants
      restaurants = await prisma.restaurant.findMany({
        where: { ownerId: context.user.id },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              companyName: true
            }
          },
          _count: {
            select: {
              staff: true,
              menuItems: true,
              orders: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      restaurants,
      meta: {
        total: restaurants.length,
        userType: context.user.userType,
        permissions: context.permissions,
        currentRole: context.currentRole.roleTemplate
      }
    });
  } catch (error) {
    console.error('Restaurant management API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/rbac-protected/restaurant-management
// Requires: restaurant_owner or platform_admin role with restaurant:write permission
export async function POST(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['restaurant_owner', 'platform_admin'],
      requiredPermissions: ['restaurant:write'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 50 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { name, description, address, phone, email, timezone, currency } = await request.json();

    // Validate input
    if (!name || !address || !phone || !email) {
      return NextResponse.json(
        { error: 'Name, address, phone, and email are required' },
        { status: 400 }
      );
    }

    // Create restaurant
    let restaurant;
    
    if (context.user.userType === 'platform_admin') {
      // Platform admin can create restaurants for any owner
      const { ownerId } = await request.json();
      
      if (!ownerId) {
        return NextResponse.json(
          { error: 'Owner ID is required for platform admin' },
          { status: 400 }
        );
      }
      
      restaurant = await prisma.restaurant.create({
        data: {
          name,
          description,
          address,
          phone,
          email,
          timezone: timezone || 'UTC',
          currency: currency || 'USD',
          ownerId,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
          isActive: true
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              companyName: true
            }
          }
        }
      });
    } else if (context.user.userType === 'restaurant_owner') {
      // Restaurant owner can only create restaurants for themselves
      restaurant = await prisma.restaurant.create({
        data: {
          name,
          description,
          address,
          phone,
          email,
          timezone: timezone || 'UTC',
          currency: currency || 'USD',
          ownerId: context.user.id,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
          isActive: true
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              companyName: true
            }
          }
        }
      });
    } else {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      message: 'Restaurant created successfully',
      restaurant
    }, { status: 201 });
  } catch (error) {
    console.error('Restaurant creation API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/rbac-protected/restaurant-management/[id]
// Requires: restaurant_owner (own restaurant) or platform_admin role with restaurant:write permission
export async function PUT(request: NextRequest) {
  try {
    // Apply RBAC middleware
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['restaurant_owner', 'platform_admin'],
      requiredPermissions: ['restaurant:write'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 100 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { restaurantId, name, description, address, phone, email, timezone, currency, isActive } = await request.json();

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant ID is required' },
        { status: 400 }
      );
    }

    // Check if user can update this restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    // Authorization check
    if (context.user.userType === 'restaurant_owner' && restaurant.ownerId !== context.user.id) {
      return NextResponse.json(
        { error: 'You can only update your own restaurants' },
        { status: 403 }
      );
    }

    // Update restaurant
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(address && { address }),
        ...(phone && { phone }),
        ...(email && { email }),
        ...(timezone && { timezone }),
        ...(currency && { currency }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true
          }
        }
      }
    });

    return NextResponse.json({
      message: 'Restaurant updated successfully',
      restaurant: updatedRestaurant
    });
  } catch (error) {
    console.error('Restaurant update API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/rbac-protected/restaurant-management/[id]
// Requires: platform_admin role with restaurant:delete permission
export async function DELETE(request: NextRequest) {
  try {
    // Apply RBAC middleware with strict permissions
    const authResult = await RBACMiddleware.protect(request, {
      allowedUserTypes: ['platform_admin'],
      requiredPermissions: ['restaurant:delete'],
      auditLog: true,
      rateLimit: { windowMs: 60000, maxRequests: 20 }
    });

    if (!authResult.isAuthorized) {
      return authResult.response!;
    }

    const { context } = authResult;
    const { restaurantId } = await request.json();

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant ID is required' },
        { status: 400 }
      );
    }

    // Check if restaurant exists
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        _count: {
          select: {
            staff: true,
            orders: true,
            menuItems: true
          }
        }
      }
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    // Soft delete - mark as inactive instead of hard delete
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });

    return NextResponse.json({
      message: 'Restaurant deleted successfully',
      restaurant: updatedRestaurant
    });
  } catch (error) {
    console.error('Restaurant deletion API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}