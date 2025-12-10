import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get restaurant ID from RBAC payload
    const restaurantId = authResult.user.currentRole?.restaurantId;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant access required' },
        { status: 403 }
      );
    }

    const hasMenuPermission = authResult.user.currentRole?.permissions.menu?.includes('write');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const itemId = params.id;
    const updateData = await request.json();

    // Verify item belongs to restaurant
    const existingItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: {
        category: true
      }
    });

    if (!existingItem || existingItem.category.restaurantId !== restaurantId) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    // If categoryId is being changed, verify new category belongs to restaurant
    if (updateData.categoryId && updateData.categoryId !== existingItem.categoryId) {
      const newCategory = await prisma.menuCategory.findUnique({
        where: { id: updateData.categoryId }
      });

      if (!newCategory || newCategory.restaurantId !== restaurantId) {
        return NextResponse.json(
          { error: 'Invalid category' },
          { status: 400 }
        );
      }
    }

    // Clean update data
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
    } = updateData;

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(categoryId && { categoryId }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(preparationTime !== undefined && { preparationTime }),
        ...(calories !== undefined && { calories }),
        ...(allergens !== undefined && { allergens }),
        ...(dietaryInfo !== undefined && { dietaryInfo }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isFeatured !== undefined && { isFeatured }),
        ...(displayOrder !== undefined && { displayOrder }),
        updatedAt: new Date()
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
      message: 'Menu item updated successfully'
    });

  } catch (error) {
    console.error('Failed to update menu item:', error);
    return NextResponse.json(
      { error: 'Failed to update menu item' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get restaurant ID from RBAC payload
    const restaurantId = authResult.user.currentRole?.restaurantId;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant access required' },
        { status: 403 }
      );
    }

    const hasMenuPermission = authResult.user.currentRole?.permissions.menu?.includes('delete');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const itemId = params.id;

    // Verify item belongs to restaurant
    const existingItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: {
        category: true
      }
    });

    if (!existingItem || existingItem.category.restaurantId !== restaurantId) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    // Delete variations first, then the item
    await prisma.menuItemVariation.deleteMany({
      where: { menuItemId: itemId }
    });

    await prisma.menuItem.delete({
      where: { id: itemId }
    });

    return NextResponse.json({
      success: true,
      message: 'Menu item deleted successfully'
    });

  } catch (error) {
    console.error('Failed to delete menu item:', error);
    return NextResponse.json(
      { error: 'Failed to delete menu item' },
      { status: 500 }
    );
  }
}