import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId: authResult.staff.restaurantId
      },
      include: {
        menuItems: {
          orderBy: { displayOrder: 'asc' },
          include: {
            variations: {
              orderBy: { displayOrder: 'asc' }
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
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check permissions
    const hasMenuPermission = authResult.staff.role.permissions.menu?.includes('write');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
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
    if (!finalDisplayOrder) {
      const lastCategory = await prisma.menuCategory.findFirst({
        where: { restaurantId: authResult.staff.restaurantId },
        orderBy: { displayOrder: 'desc' }
      });
      finalDisplayOrder = (lastCategory?.displayOrder || 0) + 1;
    }

    const category = await prisma.menuCategory.create({
      data: {
        restaurantId: authResult.staff.restaurantId,
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
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    );
  }
}