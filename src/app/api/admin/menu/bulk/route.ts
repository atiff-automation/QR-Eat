import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken } from '@/lib/auth';

export async function PATCH(request: NextRequest) {
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

    const { operation, itemIds, updateData } = await request.json();

    if (!operation || !itemIds || !Array.isArray(itemIds)) {
      return NextResponse.json(
        { error: 'Operation and item IDs are required' },
        { status: 400 }
      );
    }

    // Verify all items belong to restaurant
    const items = await prisma.menuItem.findMany({
      where: {
        id: { in: itemIds },
        category: {
          restaurantId: authResult.staff.restaurantId
        }
      }
    });

    if (items.length !== itemIds.length) {
      return NextResponse.json(
        { error: 'Some items not found or unauthorized' },
        { status: 400 }
      );
    }

    let result;
    switch (operation) {
      case 'enable':
        result = await prisma.menuItem.updateMany({
          where: { id: { in: itemIds } },
          data: { isAvailable: true }
        });
        break;

      case 'disable':
        result = await prisma.menuItem.updateMany({
          where: { id: { in: itemIds } },
          data: { isAvailable: false }
        });
        break;

      case 'feature':
        result = await prisma.menuItem.updateMany({
          where: { id: { in: itemIds } },
          data: { isFeatured: true }
        });
        break;

      case 'unfeature':
        result = await prisma.menuItem.updateMany({
          where: { id: { in: itemIds } },
          data: { isFeatured: false }
        });
        break;

      case 'update_category':
        if (!updateData?.categoryId) {
          return NextResponse.json(
            { error: 'Category ID required for category update' },
            { status: 400 }
          );
        }

        // Verify category belongs to restaurant
        const category = await prisma.menuCategory.findUnique({
          where: { id: updateData.categoryId }
        });

        if (!category || category.restaurantId !== authResult.staff.restaurantId) {
          return NextResponse.json(
            { error: 'Invalid category' },
            { status: 400 }
          );
        }

        result = await prisma.menuItem.updateMany({
          where: { id: { in: itemIds } },
          data: { categoryId: updateData.categoryId }
        });
        break;

      case 'update_prices':
        if (!updateData?.priceAdjustment) {
          return NextResponse.json(
            { error: 'Price adjustment required' },
            { status: 400 }
          );
        }

        const { type, value } = updateData.priceAdjustment;
        
        // Get current prices
        const currentItems = await prisma.menuItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, price: true }
        });

        // Calculate new prices
        const updates = currentItems.map(item => {
          let newPrice = item.price;
          if (type === 'percentage') {
            newPrice = item.price * (1 + value / 100);
          } else if (type === 'fixed') {
            newPrice = item.price + value;
          }
          
          return prisma.menuItem.update({
            where: { id: item.id },
            data: { price: Math.max(0, newPrice) } // Ensure price doesn't go negative
          });
        });

        await prisma.$transaction(updates);
        result = { count: updates.length };
        break;

      case 'delete':
        // First delete variations
        await prisma.menuItemVariation.deleteMany({
          where: { menuItemId: { in: itemIds } }
        });

        result = await prisma.menuItem.deleteMany({
          where: { id: { in: itemIds } }
        });
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid operation' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      operation,
      affectedItems: result.count || itemIds.length,
      message: `Bulk ${operation} completed successfully`
    });

  } catch (error) {
    console.error('Failed to perform bulk operation:', error);
    return NextResponse.json(
      { error: 'Failed to perform bulk operation' },
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

    const { items } = await request.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      );
    }

    // Validate all items have required fields
    for (const item of items) {
      if (!item.categoryId || !item.name || !item.price) {
        return NextResponse.json(
          { error: 'Each item must have categoryId, name, and price' },
          { status: 400 }
        );
      }
    }

    // Verify all categories belong to restaurant
    const categoryIds = [...new Set(items.map(item => item.categoryId))];
    const categories = await prisma.menuCategory.findMany({
      where: {
        id: { in: categoryIds },
        restaurantId: authResult.staff.restaurantId
      }
    });

    if (categories.length !== categoryIds.length) {
      return NextResponse.json(
        { error: 'Some categories not found or unauthorized' },
        { status: 400 }
      );
    }

    // Create items in transaction
    const createdItems = await prisma.$transaction(
      items.map((item, index) => {
        return prisma.menuItem.create({
          data: {
            restaurantId: authResult.staff.restaurantId,
            categoryId: item.categoryId,
            name: item.name,
            description: item.description || null,
            price: parseFloat(item.price),
            imageUrl: item.imageUrl || null,
            preparationTime: item.preparationTime || 15,
            calories: item.calories ? parseInt(item.calories) : null,
            allergens: item.allergens || [],
            dietaryInfo: item.dietaryInfo || [],
            isAvailable: item.isAvailable !== false,
            isFeatured: item.isFeatured || false,
            displayOrder: item.displayOrder || (index + 1)
          }
        });
      })
    );

    return NextResponse.json({
      success: true,
      items: createdItems,
      message: `${createdItems.length} menu items created successfully`
    });

  } catch (error) {
    console.error('Failed to bulk create menu items:', error);
    return NextResponse.json(
      { error: 'Failed to bulk create menu items' },
      { status: 500 }
    );
  }
}