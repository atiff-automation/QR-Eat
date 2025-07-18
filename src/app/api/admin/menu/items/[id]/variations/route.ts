import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const itemId = params.id;

    // Verify item belongs to restaurant
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: {
        category: true,
        variations: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    });

    if (!menuItem || menuItem.category.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      variations: menuItem.variations
    });

  } catch (error) {
    console.error('Failed to fetch menu item variations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch variations' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const itemId = params.id;
    const {
      name,
      priceModifier,
      variationType,
      isRequired,
      maxSelections,
      displayOrder
    } = await request.json();

    if (!name || !variationType) {
      return NextResponse.json(
        { error: 'Name and variation type are required' },
        { status: 400 }
      );
    }

    // Verify item belongs to restaurant
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: {
        category: true
      }
    });

    if (!menuItem || menuItem.category.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    // Get next display order if not provided
    let finalDisplayOrder = displayOrder;
    if (!finalDisplayOrder) {
      const lastVariation = await prisma.menuItemVariation.findFirst({
        where: { menuItemId: itemId },
        orderBy: { displayOrder: 'desc' }
      });
      finalDisplayOrder = (lastVariation?.displayOrder || 0) + 1;
    }

    const variation = await prisma.menuItemVariation.create({
      data: {
        menuItemId: itemId,
        name,
        priceModifier: parseFloat(priceModifier || '0'),
        variationType,
        isRequired: isRequired || false,
        maxSelections: maxSelections || null,
        displayOrder: finalDisplayOrder
      }
    });

    return NextResponse.json({
      success: true,
      variation,
      message: 'Menu item variation created successfully'
    });

  } catch (error) {
    console.error('Failed to create menu item variation:', error);
    return NextResponse.json(
      { error: 'Failed to create variation' },
      { status: 500 }
    );
  }
}