import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  categoryType: string;
  isSystem: boolean;
  displayOrder: number;
  createdAt: Date;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateCategorySchema = z.object({
  restaurantId: z.string().uuid('Invalid restaurant ID'),
  name: z
    .string()
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name must not exceed 100 characters')
    .trim(),
  description: z.string().max(500).optional(),
  categoryType: z.enum(['COGS', 'OPERATING', 'OTHER']),
});

type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

// ============================================================================
// GET Handler - List all categories (system + custom)
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

    // Get restaurantId from query params
    const url = new URL(request.url);
    const restaurantId = url.searchParams.get('restaurantId');

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant ID is required' },
        { status: 400 }
      );
    }

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

    const categories = await prisma.expenseCategory.findMany({
      where: {
        OR: [
          { restaurantId: null, isSystem: true },
          { restaurantId: restaurantId },
        ],
        isActive: true,
      },
      orderBy: [{ categoryType: 'asc' }, { displayOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        categoryType: true,
        isSystem: true,
        displayOrder: true,
        createdAt: true,
      },
    });

    // Group by category type
    const grouped = {
      COGS: categories.filter(
        (c: ExpenseCategory) => c.categoryType === 'COGS'
      ),
      OPERATING: categories.filter(
        (c: ExpenseCategory) => c.categoryType === 'OPERATING'
      ),
      OTHER: categories.filter(
        (c: ExpenseCategory) => c.categoryType === 'OTHER'
      ),
    };

    return NextResponse.json({
      success: true,
      categories: grouped,
      total: categories.length,
    });
  } catch (error) {
    console.error('[Expense Categories API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense categories' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST Handler - Create custom category
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
    const validatedData: CreateCategoryInput = CreateCategorySchema.parse(body);

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

    // Get next display order for this category type
    const lastCategory = await prisma.expenseCategory.findFirst({
      where: {
        restaurantId: validatedData.restaurantId,
        categoryType: validatedData.categoryType,
      },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });

    const nextDisplayOrder = (lastCategory?.displayOrder ?? -1) + 1;

    // Create custom category
    const category = await prisma.expenseCategory.create({
      data: {
        restaurantId: validatedData.restaurantId,
        name: validatedData.name,
        description: validatedData.description,
        categoryType: validatedData.categoryType,
        isSystem: false, // Custom categories are never system categories
        isActive: true,
        displayOrder: nextDisplayOrder,
      },
      select: {
        id: true,
        name: true,
        description: true,
        categoryType: true,
        isSystem: true,
        displayOrder: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        category,
        message: 'Category created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Expense Categories API] POST error:', error);

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
      { error: 'Failed to create category' },
      { status: 500 }
    );
  }
}
