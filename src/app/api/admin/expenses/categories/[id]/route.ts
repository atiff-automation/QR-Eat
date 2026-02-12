import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { z } from 'zod';

// ============================================================================
// Validation Schemas
// ============================================================================

const UpdateCategorySchema = z.object({
  name: z
    .string()
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name must not exceed 100 characters')
    .trim()
    .optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

// ============================================================================
// PUT Handler - Update custom category
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const categoryId = params.id;

    // Authentication
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData: UpdateCategoryInput = UpdateCategorySchema.parse(body);

    // Fetch existing category
    const existingCategory = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        restaurantId: true,
        isSystem: true,
        name: true,
      },
    });

    if (!existingCategory) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // Prevent editing system categories
    if (existingCategory.isSystem) {
      return NextResponse.json(
        { error: 'System categories cannot be edited' },
        { status: 403 }
      );
    }

    // Verify category belongs to a restaurant (not system category)
    if (!existingCategory.restaurantId) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // Authorization - Check user has access to this restaurant
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: {
          id: existingCategory.restaurantId,
          ownerId: authResult.user.id,
        },
        select: { id: true },
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'Access denied to this category' },
          { status: 403 }
        );
      }
    } else if (userType === 'staff') {
      const staffRestaurantId = authResult.user.currentRole?.restaurantId;
      if (staffRestaurantId !== existingCategory.restaurantId) {
        return NextResponse.json(
          { error: 'Access denied to this category' },
          { status: 403 }
        );
      }

      // Check if staff has permission
      const hasPermission = await AuthServiceV2.checkPermission(
        authResult.user.id,
        'expenses.edit'
      );

      if (!hasPermission) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 403 });
    }

    // Update category (only allowed fields)
    const updatedCategory = await prisma.expenseCategory.update({
      where: { id: categoryId },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.description !== undefined && {
          description: validatedData.description,
        }),
        ...(validatedData.isActive !== undefined && {
          isActive: validatedData.isActive,
        }),
      },
      select: {
        id: true,
        name: true,
        description: true,
        categoryType: true,
        isSystem: true,
        isActive: true,
        displayOrder: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      category: updatedCategory,
      message: 'Category updated successfully',
    });
  } catch (error) {
    console.error('[Expense Categories API] PUT error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: error.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE Handler - Delete custom category
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const categoryId = params.id;

    // Authentication
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

    // Fetch existing category
    const existingCategory = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        restaurantId: true,
        isSystem: true,
        name: true,
        _count: {
          select: { expenses: true },
        },
      },
    });

    if (!existingCategory) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // Prevent deleting system categories
    if (existingCategory.isSystem) {
      return NextResponse.json(
        { error: 'System categories cannot be deleted' },
        { status: 403 }
      );
    }

    // Verify category belongs to a restaurant
    if (!existingCategory.restaurantId) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // Authorization - Only owners can delete
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: {
          id: existingCategory.restaurantId,
          ownerId: authResult.user.id,
        },
        select: { id: true },
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'Access denied to this category' },
          { status: 403 }
        );
      }
    } else {
      // Staff cannot delete categories
      return NextResponse.json(
        { error: 'Only restaurant owners can delete categories' },
        { status: 403 }
      );
    }

    // Check if category has linked expenses
    if (existingCategory._count.expenses > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete category with existing expenses',
          expenseCount: existingCategory._count.expenses,
          message: `This category has ${existingCategory._count.expenses} expense(s). Please reassign or delete them first.`,
        },
        { status: 409 }
      );
    }

    // Delete category
    await prisma.expenseCategory.delete({
      where: { id: categoryId },
    });

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    console.error('[Expense Categories API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
