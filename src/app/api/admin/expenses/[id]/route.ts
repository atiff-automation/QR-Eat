import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { z } from 'zod';

// ============================================================================
// Validation Schemas
// ============================================================================

const UpdateExpenseSchema = z.object({
  categoryId: z.string().min(1, 'Invalid category ID').optional(),
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(999999.99, 'Amount too large')
    .optional(),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description too long')
    .trim()
    .optional(),
  expenseDate: z
    .string()
    .date('Invalid date format (expected YYYY-MM-DD)')
    .optional(),
  vendor: z.string().max(200).optional().nullable(),
  paymentMethod: z
    .enum(['CASH', 'CARD', 'BANK_TRANSFER', 'EWALLET'])
    .optional(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;

// ============================================================================
// GET Handler - Get single expense
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const expenseId = params.id;

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

    // Fetch expense
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            categoryType: true,
            isSystem: true,
          },
        },
      },
    });

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Authorization - Check user has access to this restaurant
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: {
          id: expense.restaurantId,
          ownerId: authResult.user.id,
        },
        select: { id: true },
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'Access denied to this expense' },
          { status: 403 }
        );
      }
    } else if (userType === 'staff') {
      const staffRestaurantId = authResult.user.currentRole?.restaurantId;
      if (staffRestaurantId !== expense.restaurantId) {
        return NextResponse.json(
          { error: 'Access denied to this expense' },
          { status: 403 }
        );
      }

      // Check if staff has permission
      const hasPermission = await AuthServiceV2.checkPermission(
        authResult.user.id,
        'expenses.view'
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

    return NextResponse.json({
      success: true,
      expense,
    });
  } catch (error) {
    console.error('[Expenses API] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT Handler - Update expense
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const expenseId = params.id;

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
    const validatedData: UpdateExpenseInput = UpdateExpenseSchema.parse(body);

    // Fetch existing expense
    const existingExpense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        restaurantId: true,
        categoryId: true,
      },
    });

    if (!existingExpense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Validate expense date is not in the future (if provided)
    if (validatedData.expenseDate) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (validatedData.expenseDate > todayStr) {
        return NextResponse.json(
          { error: 'Expense date cannot be in the future' },
          { status: 400 }
        );
      }
    }

    // Authorization - Check user has access to this restaurant
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: {
          id: existingExpense.restaurantId,
          ownerId: authResult.user.id,
        },
        select: { id: true },
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'Access denied to this expense' },
          { status: 403 }
        );
      }
    } else if (userType === 'staff') {
      const staffRestaurantId = authResult.user.currentRole?.restaurantId;
      if (staffRestaurantId !== existingExpense.restaurantId) {
        return NextResponse.json(
          { error: 'Access denied to this expense' },
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

    // If category is being changed, verify it exists and belongs to restaurant
    if (validatedData.categoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: {
          id: validatedData.categoryId,
          OR: [
            { restaurantId: existingExpense.restaurantId },
            { isSystem: true },
          ],
          isActive: true,
        },
        select: { id: true },
      });

      if (!category) {
        return NextResponse.json(
          { error: 'Category not found or not available for this restaurant' },
          { status: 404 }
        );
      }
    }

    // Update expense with audit trail
    const updatedExpense = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(validatedData.categoryId && {
          categoryId: validatedData.categoryId,
        }),
        ...(validatedData.amount !== undefined && {
          amount: validatedData.amount,
        }),
        ...(validatedData.description && {
          description: validatedData.description,
        }),
        ...(validatedData.expenseDate && {
          expenseDate: new Date(validatedData.expenseDate),
        }),
        ...(validatedData.vendor !== undefined && {
          vendor: validatedData.vendor,
        }),
        ...(validatedData.paymentMethod && {
          paymentMethod: validatedData.paymentMethod,
        }),
        ...(validatedData.invoiceNumber !== undefined && {
          invoiceNumber: validatedData.invoiceNumber,
        }),
        ...(validatedData.notes !== undefined && {
          notes: validatedData.notes,
        }),
        lastEditedBy: authResult.user.id,
        lastEditedByType: userType,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            categoryType: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      expense: updatedExpense,
      message: 'Expense updated successfully',
    });
  } catch (error) {
    console.error('[Expenses API] PUT error:', error);

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
      { error: 'Failed to update expense' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE Handler - Delete expense (owners only)
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const expenseId = params.id;

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

    // Fetch existing expense
    const existingExpense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        restaurantId: true,
        description: true,
        amount: true,
      },
    });

    if (!existingExpense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Authorization - Only owners can delete
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: {
          id: existingExpense.restaurantId,
          ownerId: authResult.user.id,
        },
        select: { id: true },
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'Access denied to this expense' },
          { status: 403 }
        );
      }
    } else {
      // Staff cannot delete expenses
      return NextResponse.json(
        { error: 'Only restaurant owners can delete expenses' },
        { status: 403 }
      );
    }

    // Delete expense
    await prisma.expense.delete({
      where: { id: expenseId },
    });

    return NextResponse.json({
      success: true,
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    console.error('[Expenses API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Failed to delete expense' },
      { status: 500 }
    );
  }
}
