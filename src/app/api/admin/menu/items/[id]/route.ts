import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication using RBAC system
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
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

    // Check if user has menu write permission
    // Permissions are stored at user.permissions, not user.currentRole.permissions
    const permissions = authResult.user.permissions || [];
    const hasMenuPermission = permissions.includes('menu:write');

    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const itemId = params.id;
    const updateData = await request.json();

    // 🔍 DEBUG: Log incoming update request
    console.log('📝 [MENU UPDATE] Request received for item:', itemId);
    console.log(
      '📦 [MENU UPDATE] Update payload:',
      JSON.stringify(updateData, null, 2)
    );
    console.log('🏢 [MENU UPDATE] Restaurant ID from auth:', restaurantId);

    // Verify item belongs to restaurant
    const existingItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: {
        category: true,
      },
    });

    // 🔍 DEBUG: Log existing item state
    if (existingItem) {
      console.log('🔍 [MENU UPDATE] Existing item found:', {
        id: existingItem.id,
        name: existingItem.name,
        restaurantId: existingItem.restaurantId,
        categoryId: existingItem.categoryId,
        categoryRestaurantId: existingItem.category.restaurantId,
        hasRestaurantId: !!existingItem.restaurantId,
        restaurantIdMatch: existingItem.restaurantId === restaurantId,
      });
    } else {
      console.log('❌ [MENU UPDATE] Item not found in database');
    }

    if (!existingItem || existingItem.category.restaurantId !== restaurantId) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    // If categoryId is being changed, verify new category belongs to restaurant
    if (
      updateData.categoryId &&
      updateData.categoryId !== existingItem.categoryId
    ) {
      const newCategory = await prisma.menuCategory.findUnique({
        where: { id: updateData.categoryId },
      });

      if (!newCategory || newCategory.restaurantId !== restaurantId) {
        return NextResponse.json(
          { error: 'Invalid category' },
          { status: 400 }
        );
      }
    }

    // Clean update data - restaurantId is not included in updates
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
      displayOrder,
    } = updateData;

    // Build update data object
    const updatePayload = {
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
      updatedAt: new Date(),
    };

    // 🔍 DEBUG: Log the actual update payload being sent to Prisma
    console.log(
      '🔄 [MENU UPDATE] Prisma update payload:',
      JSON.stringify(updatePayload, null, 2)
    );

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: updatePayload,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        variations: true,
      },
    });

    // 🔍 DEBUG: Log successful update
    console.log('✅ [MENU UPDATE] Update successful:', {
      id: item.id,
      name: item.name,
      restaurantId: item.restaurantId,
      imageUrl: item.imageUrl,
    });

    return NextResponse.json({
      success: true,
      item,
      message: 'Menu item updated successfully',
    });
  } catch (error: unknown) {
    // 🔍 DEBUG: Enhanced error logging
    console.error('❌ [MENU UPDATE] Failed to update menu item');
    console.error('Error name:', error?.name);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Error meta:', error?.meta);
    console.error('Full error:', error);

    // Check for specific Prisma errors
    if (error?.code === 'P2002') {
      console.error('🔴 [MENU UPDATE] Unique constraint violation');
    } else if (error?.code === 'P2003') {
      console.error('🔴 [MENU UPDATE] Foreign key constraint violation');
    } else if (error?.code === 'P2025') {
      console.error('🔴 [MENU UPDATE] Record not found');
    }

    return NextResponse.json(
      {
        error: 'Failed to update menu item',
        details:
          process.env.NODE_ENV === 'development' ? error?.message : undefined,
      },
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
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
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

    // Check if user has menu delete permission
    // Permissions are stored at user.permissions, not user.currentRole.permissions
    const permissions = authResult.user.permissions || [];
    const hasMenuPermission = permissions.includes('menu:delete');

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
        category: true,
      },
    });

    if (!existingItem || existingItem.category.restaurantId !== restaurantId) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    // Delete variations first, then the item
    await prisma.menuItemVariation.deleteMany({
      where: { menuItemId: itemId },
    });

    await prisma.menuItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({
      success: true,
      message: 'Menu item deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete menu item:', error);
    return NextResponse.json(
      { error: 'Failed to delete menu item' },
      { status: 500 }
    );
  }
}
