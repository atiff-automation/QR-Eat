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

    const url = new URL(request.url);
    const categoryId = url.searchParams.get('categoryId');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    const whereClause: any = {
      category: {
        restaurantId: authResult.staff.restaurantId
      }
    };

    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    if (!includeInactive) {
      whereClause.isAvailable = true;
    }

    const items = await prisma.menuItem.findMany({
      where: whereClause,
      include: {
        category: {
          select: {
            id: true,
            name: true
          }
        },
        variations: {
          orderBy: { displayOrder: 'asc' }
        }
      },
      orderBy: [
        { category: { displayOrder: 'asc' } },
        { displayOrder: 'asc' }
      ]
    });

    return NextResponse.json({
      success: true,
      items
    });

  } catch (error) {
    console.error('Failed to fetch menu items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch menu items' },
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

    const hasMenuPermission = authResult.staff.role.permissions.menu?.includes('write');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const {
      categoryId,
      name,
      description,
      price,
      imageUrl,
      preparationTime,
      calories,
      allergens,
      dietaryInfo,
      isAvailable,
      isFeatured,
      displayOrder
    } = await request.json();

    if (!categoryId || !name || !price) {
      return NextResponse.json(
        { error: 'Category ID, name, and price are required' },
        { status: 400 }
      );
    }

    // Verify category belongs to restaurant
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category || category.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Get next display order if not provided
    let finalDisplayOrder = displayOrder;
    if (!finalDisplayOrder) {
      const lastItem = await prisma.menuItem.findFirst({
        where: { categoryId },
        orderBy: { displayOrder: 'desc' }
      });
      finalDisplayOrder = (lastItem?.displayOrder || 0) + 1;
    }

    const item = await prisma.menuItem.create({
      data: {
        restaurantId: authResult.staff.restaurantId,
        categoryId,
        name,
        description,
        price: parseFloat(price),
        imageUrl: imageUrl || null,
        preparationTime: preparationTime || 15,
        calories: calories ? parseInt(calories) : null,
        allergens: allergens || [],
        dietaryInfo: dietaryInfo || [],
        isAvailable: isAvailable !== false,
        isFeatured: isFeatured || false,
        displayOrder: finalDisplayOrder
      },
      include: {
        category: {
          select: {
            id: true,
            name: true
          }
        },
        variations: true
      }
    });

    return NextResponse.json({
      success: true,
      item,
      message: 'Menu item created successfully'
    });

  } catch (error) {
    console.error('Failed to create menu item:', error);
    return NextResponse.json(
      { error: 'Failed to create menu item' },
      { status: 500 }
    );
  }
}