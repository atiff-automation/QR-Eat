import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { validateApiInput, Sanitizer, SecurityValidator } from '@/lib/validation';
import {
} from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const categoryId = url.searchParams.get('categoryId');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    // User type check
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;

    // For restaurant owners, we need to get the first restaurant they own
    let restaurantFilter: any;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: authResult.user.id },
        select: { id: true }
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'No restaurant found for owner' },
          { status: 404 }
        );
      }

      restaurantFilter = {
        category: {
          restaurantId: ownerRestaurant.id
        }
      };
    } else {
      const restaurantId = authResult.user.currentRole?.restaurantId;
      if (!restaurantId) {
        return NextResponse.json({ error: 'Restaurant access required' }, { status: 403 });
      }
      restaurantFilter = {
        category: {
          restaurantId
        }
      };
    }

    const whereClause: any = { ...restaurantFilter };

    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    if (!includeInactive) {
      whereClause.isAvailable = true;
    }

    const items = await prisma.menuItem.findMany({
      where: whereClause,
      include: {
        category: {
          select: {
            id: true,
            name: true
          }
        },
        variations: {
          orderBy: { displayOrder: 'asc' }
        }
      },
      orderBy: [
        { category: { displayOrder: 'asc' } },
        { displayOrder: 'asc' }
      ]
    });

    return NextResponse.json({
      success: true,
      items
    });

  } catch (error) {
    console.error('Failed to fetch menu items:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch menu items' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse and validate request body
    let requestData;
    try {
      requestData = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Comprehensive input validation
    const validation = validateApiInput(requestData, {
      categoryId: { required: true, type: 'string', minLength: 1 },
      name: { required: true, type: 'string', minLength: 2, maxLength: 100 },
      description: { required: false, type: 'string', maxLength: 500 },
      price: { required: true, type: 'number', min: 0 },
      imageUrl: { required: false, type: 'string' }, // Changed from 'url' to 'string' to accept relative paths
      preparationTime: { required: false, type: 'number', min: 1, max: 300 },
      calories: { required: false, type: 'number', min: 0 },
      allergens: { required: false, type: 'array' },
      dietaryInfo: { required: false, type: 'array' },
      isAvailable: { required: false, type: 'boolean' },
      isFeatured: { required: false, type: 'boolean' },
      displayOrder: { required: false, type: 'number', min: 0 }
    });

    if (!validation.isValid) {
      console.error('Validation failed:', validation.errors);
      console.error('Request data:', requestData);
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          details: validation.errors,
          receivedData: process.env.NODE_ENV === 'development' ? requestData : undefined
        },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const {
      categoryId,
      name: rawName,
      description: rawDescription,
      price,
      imageUrl,
      preparationTime,
      calories,
      allergens,
      dietaryInfo,
      isAvailable,
      isFeatured,
      displayOrder
    } = requestData;

    const name = Sanitizer.sanitizeString(rawName);
    const description = rawDescription ? Sanitizer.sanitizeString(rawDescription) : null;

    // Security validation
    if (description && !SecurityValidator.isSafeHtml(description)) {
      return NextResponse.json(
        { error: 'Description contains unsafe content' },
        { status: 400 }
      );
    }

    // Verify category belongs to user's restaurant
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      include: {
        restaurant: true
      }
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // User type check
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;

    // Check restaurant ownership/access
    let isAuthorizedForCategory = false;

    if (userType === 'restaurant_owner') {
      isAuthorizedForCategory = category.restaurant.ownerId === authResult.user.id;
    } else {
      const restaurantId = authResult.user.currentRole?.restaurantId;
      isAuthorizedForCategory = category.restaurantId === restaurantId;
    }

    if (!isAuthorizedForCategory) {
      return NextResponse.json(
        { error: 'Access denied to this category' },
        { status: 403 }
      );
    }

    // Get next display order if not provided
    let finalDisplayOrder = displayOrder;
    if (!finalDisplayOrder) {
      const lastItem = await prisma.menuItem.findFirst({
        where: { categoryId },
        orderBy: { displayOrder: 'desc' }
      });
      finalDisplayOrder = (lastItem?.displayOrder || 0) + 1;
    }

    // Create menu item with proper error handling
    const item = await prisma.menuItem.create({
      data: {
        restaurantId: category.restaurantId,
        categoryId,
        name,
        description,
        price: Number(price),
        imageUrl: imageUrl || null,
        preparationTime: preparationTime || 15,
        calories: calories ? Number(calories) : null,
        allergens: Sanitizer.sanitizeArray(allergens),
        dietaryInfo: Sanitizer.sanitizeArray(dietaryInfo),
        isAvailable: Sanitizer.sanitizeBoolean(isAvailable ?? true),
        isFeatured: Sanitizer.sanitizeBoolean(isFeatured ?? false),
        displayOrder: finalDisplayOrder
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
      message: 'Menu item created successfully'
    });

  } catch (error) {
    console.error('Failed to create menu item:', error);
    
    // Handle specific database errors
    if (error instanceof Error) {
      // Authentication/Permission errors
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
      
      // Duplicate name in category
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'Menu item with this name already exists in the category' },
          { status: 409 }
        );
      }
      
      // Foreign key constraint
      if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json(
          { error: 'Invalid category or restaurant reference' },
          { status: 400 }
        );
      }
      
      // Database connection issues
      if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
        return NextResponse.json(
          { error: 'Database connection error. Please try again.' },
          { status: 503 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create menu item',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}