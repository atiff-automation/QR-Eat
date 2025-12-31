import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { unlink } from 'fs/promises';
import { join } from 'path';

// Utility function to delete image file
async function deleteImageFile(imageUrl: string | null): Promise<void> {
  if (!imageUrl) return;

  try {
    // Extract filename from URL (handles both /uploads/menu-images/file.jpg and /api/uploads/file.jpg)
    const filename = imageUrl.split('/').pop();
    if (!filename) return;

    // Determine the upload directory using base directory approach
    const UPLOAD_BASE_DIR = process.env.UPLOAD_BASE_DIR
      ? process.env.UPLOAD_BASE_DIR
      : join(process.cwd(), 'public', 'uploads');

    const UPLOAD_DIR = join(UPLOAD_BASE_DIR, 'menu-images');
    const filepath = join(UPLOAD_DIR, filename);

    await unlink(filepath);
    console.log('🗑️ [IMAGE CLEANUP] Deleted old image:', filename);
  } catch (error) {
    // File might not exist or already deleted - log but don't throw
    console.warn('⚠️ [IMAGE CLEANUP] Failed to delete image file:', error);
  }
}

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

    // 🗑️ Delete old image if imageUrl is being changed or removed
    if (imageUrl !== undefined && existingItem.imageUrl !== imageUrl) {
      await deleteImageFile(existingItem.imageUrl);
    }

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
    console.error('Failed to update menu item:', error);

    return NextResponse.json(
      {
        error: 'Failed to update menu item',
        details:
          process.env.NODE_ENV === 'development'
            ? (error as Error)?.message
            : undefined,
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

    // 🗑️ Delete associated image file
    await deleteImageFile(existingItem.imageUrl);

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
