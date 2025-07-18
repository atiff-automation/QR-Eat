import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: categoryId } = await params;
    const { name, description, displayOrder, isActive } = await request.json();

    // Verify category belongs to restaurant
    const existingCategory = await prisma.menuCategory.findUnique({
      where: { id: categoryId }
    });

    if (!existingCategory || existingCategory.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    const category = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      category,
      message: 'Category updated successfully'
    });

  } catch (error) {
    console.error('Failed to update category:', error);
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
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const hasMenuPermission = authResult.staff.role.permissions.menu?.includes('delete');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id: categoryId } = await params;

    // Verify category belongs to restaurant
    const existingCategory = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: { menuItems: true }
        }
      }
    });

    if (!existingCategory || existingCategory.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // Check if category has menu items
    if (existingCategory._count.menuItems > 0) {
      return NextResponse.json(
        { error: 'Cannot delete category with existing menu items. Please move or delete items first.' },
        { status: 400 }
      );
    }

    await prisma.menuCategory.delete({
      where: { id: categoryId }
    });

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    console.error('Failed to delete category:', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}