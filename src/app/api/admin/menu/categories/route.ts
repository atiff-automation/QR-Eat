import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // User type check
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;

    // For restaurant owners, we need to get the first restaurant they own
    let restaurantFilter: Record<string, unknown>;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: authResult.user.id },
        select: { id: true }
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'No restaurant found for owner' },
          { status: 404 }
        );
      }

      restaurantFilter = { restaurantId: ownerRestaurant.id };
    } else {
      const restaurantId = authResult.user.currentRole?.restaurantId;
      if (!restaurantId) {
        return NextResponse.json({ error: 'Restaurant access required' }, { status: 403 });
      }
      restaurantFilter = { restaurantId };
    }

    const categories = await prisma.menuCategory.findMany({
      where: restaurantFilter,
      include: {
        menuItems: {
          orderBy: { displayOrder: 'asc' },
          include: {
            variationGroups: {
              orderBy: { displayOrder: 'asc' },
              include: {
                options: {
                  orderBy: { displayOrder: 'asc' }
                }
              }
            }
          }
        },
        _count: {
          select: {
            menuItems: true
          }
        }
      },
      orderBy: { displayOrder: 'asc' }
    });

    return NextResponse.json({
      success: true,
      categories
    });

  } catch (error) {
    console.error('Failed to fetch categories:', error);

    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { name, description, displayOrder } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    // Get next display order if not provided
    let finalDisplayOrder = displayOrder;

    // User type check
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;

    // For restaurant owners, we need to get the first restaurant they own
    let restaurantId: string;
    let restaurantFilter: any;

    if (userType === 'restaurant_owner') {
      // Get the first restaurant owned by this user
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: authResult.user.id },
        select: { id: true }
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'No restaurant found for owner' },
          { status: 404 }
        );
      }

      restaurantId = ownerRestaurant.id;
      restaurantFilter = { restaurantId: ownerRestaurant.id };
    } else {
      // For staff, use their assigned restaurant
      restaurantId = authResult.user.currentRole?.restaurantId!;
      if (!restaurantId) {
        return NextResponse.json({ error: 'Restaurant access required' }, { status: 403 });
      }
      restaurantFilter = { restaurantId };
    }

    if (!finalDisplayOrder) {
      const lastCategory = await prisma.menuCategory.findFirst({
        where: restaurantFilter,
        orderBy: { displayOrder: 'desc' }
      });
      finalDisplayOrder = (lastCategory?.displayOrder || 0) + 1;
    }

    const category = await prisma.menuCategory.create({
      data: {
        restaurantId,
        name,
        description,
        displayOrder: finalDisplayOrder,
        isActive: true
      }
    });

    return NextResponse.json({
      success: true,
      category,
      message: 'Category created successfully'
    });

  } catch (error) {
    console.error('Failed to create category:', error);

    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    );
  }
}