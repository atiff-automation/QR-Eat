import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params;

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
    const permissions = authResult.user.permissions || [];
    const hasMenuPermission = permissions.includes('menu:write');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { name, description, displayOrder, isActive } = await request.json();

    console.log('📝 Category Update Request:', {
      categoryId,
      requestBody: { name, description, displayOrder, isActive },
    });

    // Verify category belongs to restaurant
    const existingCategory = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existingCategory || existingCategory.restaurantId !== restaurantId) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    console.log('🔍 Existing Category State:', {
      categoryId,
      currentIsActive: existingCategory.isActive,
      newIsActive: isActive,
      willCascade: isActive === false && existingCategory.isActive === true,
    });

    // Use transaction to update category and cascade to items if needed
    const result = await prisma.$transaction(async (tx) => {
      // Update the category
      const category = await tx.menuCategory.update({
        where: { id: categoryId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(displayOrder !== undefined && { displayOrder }),
          ...(isActive !== undefined && { isActive }),
          updatedAt: new Date(),
        },
      });

      // Cascade: If category is being deactivated, deactivate all its items
      if (isActive === false && existingCategory.isActive === true) {
        console.log(
          '🔄 CASCADE TRIGGERED: Deactivating all items in category',
          categoryId
        );

        const updateResult = await tx.menuItem.updateMany({
          where: { categoryId: categoryId },
          data: { isAvailable: false },
        });

        console.log('✅ CASCADE COMPLETE:', {
          categoryId,
          itemsUpdated: updateResult.count,
        });
      } else {
        console.log('⏭️ CASCADE SKIPPED:', {
          reason:
            isActive === false
              ? 'Category was already inactive'
              : 'Category is being activated (no cascade)',
        });
      }

      return category;
    });

    return NextResponse.json({
      success: true,
      category: result,
      message: 'Category updated successfully',
    });
  } catch (error) {
    console.error('Failed to update category:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      categoryId,
    });
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params;

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
    const permissions = authResult.user.permissions || [];
    const hasMenuPermission = permissions.includes('menu:delete');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Verify category belongs to restaurant
    const existingCategory = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: { menuItems: true },
        },
      },
    });

    if (!existingCategory || existingCategory.restaurantId !== restaurantId) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // Check if category has menu items
    if (existingCategory._count.menuItems > 0) {
      return NextResponse.json(
        {
          error:
            'Cannot delete category with existing menu items. Please move or delete items first.',
        },
        { status: 400 }
      );
    }

    await prisma.menuCategory.delete({
      where: { id: categoryId },
    });

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete category:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      categoryId,
    });
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
