import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { z } from 'zod';
import { Sanitizer } from '@/lib/validation';

// ============================================================================
// Validation Schemas
// ============================================================================

const VariationOptionSchema = z.object({
  name: z.string().min(1, 'Option name is required'),
  priceModifier: z.number().min(0).default(0),
  isAvailable: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

const VariationGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(0).default(1),
  displayOrder: z.number().int().default(0),
  options: z.array(VariationOptionSchema).default([]),
});

const CreateMenuItemSchema = z.object({
  restaurantId: z.string().uuid().optional(), // Can come from context
  categoryId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  price: z.number().min(0, 'Price must be positive'),
  imageUrl: z.string().optional().or(z.literal('')),
  preparationTime: z.number().int().min(0).default(0),
  calories: z.number().int().optional(),
  allergens: z.array(z.string()).default([]),
  dietaryInfo: z.array(z.string()).default([]),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  variationGroups: z.array(VariationGroupSchema).default([]),
});

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
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

    const url = new URL(request.url);
    const categoryId = url.searchParams.get('categoryId');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    // Access Control Logic
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;
    let restaurantFilter: Prisma.MenuItemWhereInput;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: authResult.user.id },
        select: { id: true },
      });
      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'No restaurant found' },
          { status: 404 }
        );
      }
      restaurantFilter = { category: { restaurantId: ownerRestaurant.id } };
    } else {
      const restaurantId = authResult.user.currentRole?.restaurantId;
      if (!restaurantId) {
        return NextResponse.json(
          { error: 'Restaurant access required' },
          { status: 403 }
        );
      }
      restaurantFilter = { category: { restaurantId } };
    }

    const whereClause: Prisma.MenuItemWhereInput = { ...restaurantFilter };
    if (categoryId) whereClause.categoryId = categoryId;
    if (!includeInactive) whereClause.isAvailable = true;

    // Fetch items with new structure
    const items = await prisma.menuItem.findMany({
      where: whereClause,
      include: {
        category: {
          select: { id: true, name: true },
        },
        variationGroups: {
          include: {
            options: {
              orderBy: { displayOrder: 'asc' },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: [{ category: { displayOrder: 'asc' } }, { displayOrder: 'asc' }],
    });

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error('Failed to fetch menu items:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth Check
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

    const body = await request.json();
    const validatedData = CreateMenuItemSchema.parse(body);

    // Determine Context Restaurant ID
    let restaurantId = validatedData.restaurantId;
    if (!restaurantId) {
      const userType =
        authResult.user.currentRole?.userType || authResult.user.userType;
      if (userType === 'restaurant_owner') {
        const ownerRestaurant = await prisma.restaurant.findFirst({
          where: { ownerId: authResult.user.id },
        });
        restaurantId = ownerRestaurant?.id;
      } else {
        restaurantId = authResult.user.currentRole?.restaurantId;
      }
    }

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Could not determine restaurant context' },
        { status: 400 }
      );
    }

    // Verify Category Ownership
    const category = await prisma.menuCategory.findFirst({
      where: {
        id: validatedData.categoryId,
        restaurantId: restaurantId,
      },
      select: { displayOrder: true },
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Category not found or access denied' },
        { status: 404 }
      );
    }

    // Calculate Display Order
    const lastItem = await prisma.menuItem.findFirst({
      where: { categoryId: validatedData.categoryId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    const nextDisplayOrder = (lastItem?.displayOrder ?? -1) + 1;

    // Create Item with Relations
    const newItem = await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: validatedData.categoryId,
        name: validatedData.name,
        description: validatedData.description,
        price: validatedData.price,
        imageUrl: validatedData.imageUrl || null,
        preparationTime: validatedData.preparationTime,
        calories: validatedData.calories,
        allergens: Sanitizer.sanitizeArray(validatedData.allergens),
        dietaryInfo: Sanitizer.sanitizeArray(validatedData.dietaryInfo),
        isAvailable: validatedData.isAvailable,
        isFeatured: validatedData.isFeatured,
        displayOrder: nextDisplayOrder,

        variationGroups: {
          create: validatedData.variationGroups.map((group) => ({
            name: group.name,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            displayOrder: group.displayOrder,
            options: {
              create: group.options.map((opt) => ({
                name: opt.name,
                priceModifier: opt.priceModifier,
                isAvailable: opt.isAvailable,
                displayOrder: opt.displayOrder,
              })),
            },
          })),
        },
      },
      include: {
        variationGroups: {
          include: {
            options: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      item: newItem,
      message: 'Menu item created successfully',
    });
  } catch (error) {
    console.error('Create menu item error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create menu item' },
      { status: 500 }
    );
  }
}
