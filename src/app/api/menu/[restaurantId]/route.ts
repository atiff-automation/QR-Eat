import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  try {
    const { restaurantId } = await params;

    // Get menu categories with items and nested variation groups
    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId,
        status: 'ACTIVE',
      },
      include: {
        menuItems: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            // New Schema: structured groups
            variationGroups: {
              include: {
                options: {
                  where: { isAvailable: true },
                  orderBy: { displayOrder: 'asc' },
                },
              },
              orderBy: { displayOrder: 'asc' },
            },
          },
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });

    if (categories.length === 0) {
      return NextResponse.json({ error: 'No menu available' }, { status: 404 });
    }

    // Transform data for frontend consumption
    const menu = categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      displayOrder: category.displayOrder,
      isActive: category.isActive,
      menuItems: category.menuItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: parseFloat(item.price.toString()),
        imageUrl: item.imageUrl,
        preparationTime: item.preparationTime,
        calories: item.calories,
        allergens: item.allergens,
        dietaryInfo: item.dietaryInfo,
        isAvailable: item.isAvailable,
        isFeatured: item.isFeatured,
        displayOrder: item.displayOrder,
        // Map groups and options
        variationGroups: item.variationGroups.map((group) => ({
          id: group.id,
          name: group.name,
          minSelections: group.minSelections,
          maxSelections: group.maxSelections,
          displayOrder: group.displayOrder,
          options: group.options.map((opt) => ({
            id: opt.id,
            name: opt.name,
            priceModifier: parseFloat(opt.priceModifier.toString()),
            isAvailable: opt.isAvailable,
            displayOrder: opt.displayOrder,
          })),
        })),
      })),
    }));

    return NextResponse.json(
      { menu },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('Menu fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
