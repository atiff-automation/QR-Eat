import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateExpenseSchema = z.object({
  restaurantId: z.string().uuid('Invalid restaurant ID'),
  categoryId: z.string().uuid('Invalid category ID'),
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(999999.99, 'Amount too large'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description too long')
    .trim(),
  expenseDate: z.string().datetime('Invalid date format'),
  vendor: z.string().max(200).optional(),
  paymentMethod: z
    .enum(['CASH', 'CARD', 'BANK_TRANSFER', 'EWALLET'])
    .default('CASH'),
  invoiceNumber: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;

// ============================================================================
// GET Handler - List expenses with filters and pagination
// ============================================================================

export async function GET(request: NextRequest) {
  try {
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

    // Parse query parameters
    const url = new URL(request.url);
    const restaurantId = url.searchParams.get('restaurantId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const categoryId = url.searchParams.get('categoryId');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant ID is required' },
        { status: 400 }
      );
    }

    // Set default date range (current month) if not provided
    const now = new Date();
    const defaultStartDate = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEndDate = endDate ? new Date(endDate) : now;

    // Authorization - Check user has access to this restaurant
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: {
          id: restaurantId,
          ownerId: authResult.user.id,
        },
        select: { id: true },
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'Access denied to this restaurant' },
          { status: 403 }
        );
      }
    } else if (userType === 'staff') {
      const staffRestaurantId = authResult.user.currentRole?.restaurantId;
      if (staffRestaurantId !== restaurantId) {
        return NextResponse.json(
          { error: 'Access denied to this restaurant' },
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

    {
      // Build where clause
      const where: Prisma.ExpenseWhereInput = {
        restaurantId,
        expenseDate: {
          gte: defaultStartDate,
          lte: defaultEndDate,
        },
      };

      if (categoryId) {
        where.categoryId = categoryId;
      }

      if (search) {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { vendor: { contains: search, mode: 'insensitive' } },
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Get total count for pagination
      const totalCount = await prisma.expense.count({ where });

      // Fetch expenses with pagination
      const expenses = await prisma.expense.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              categoryType: true,
            },
          },
        },
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return NextResponse.json({
        success: true,
        expenses,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: page * limit < totalCount,
        },
      });
    }
  } catch (error) {
    console.error('[Expenses API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expenses' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST Handler - Create new expense
// ============================================================================

export async function POST(request: NextRequest) {
  try {
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
    const validatedData: CreateExpenseInput = CreateExpenseSchema.parse(body);

    // Validate expense date is not in the future
    const expenseDate = new Date(validatedData.expenseDate);
    if (expenseDate > new Date()) {
      return NextResponse.json(
        { error: 'Expense date cannot be in the future' },
        { status: 400 }
      );
    }

    // Authorization - Check user has access to this restaurant
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: {
          id: validatedData.restaurantId,
          ownerId: authResult.user.id,
        },
        select: { id: true },
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'Access denied to this restaurant' },
          { status: 403 }
        );
      }
    } else if (userType === 'staff') {
      const staffRestaurantId = authResult.user.currentRole?.restaurantId;
      if (staffRestaurantId !== validatedData.restaurantId) {
        return NextResponse.json(
          { error: 'Access denied to this restaurant' },
          { status: 403 }
        );
      }

      // Check if staff has permission
      const hasPermission = await AuthServiceV2.checkPermission(
        authResult.user.id,
        'expenses.create'
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

    // Verify category exists and belongs to restaurant (or is system category)
    const category = await prisma.expenseCategory.findFirst({
      where: {
        id: validatedData.categoryId,
        OR: [{ restaurantId: validatedData.restaurantId }, { isSystem: true }],
        isActive: true,
      },
      select: { id: true, name: true },
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Category not found or not available for this restaurant' },
        { status: 404 }
      );
    }

    // Create expense with audit trail
    const expense = await prisma.expense.create({
      data: {
        restaurantId: validatedData.restaurantId,
        categoryId: validatedData.categoryId,
        amount: validatedData.amount,
        description: validatedData.description,
        expenseDate,
        vendor: validatedData.vendor,
        paymentMethod: validatedData.paymentMethod,
        invoiceNumber: validatedData.invoiceNumber,
        notes: validatedData.notes,
        recordedBy: authResult.user.id,
        recordedByType: userType,
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

    return NextResponse.json(
      {
        success: true,
        expense,
        message: 'Expense created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Expenses API] POST error:', error);

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
      { error: 'Failed to create expense' },
      { status: 500 }
    );
  }
}
