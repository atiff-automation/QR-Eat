import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  try {
    const { restaurantId } = await params;

    // Get menu categories with items and variations
    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      include: {
        menuItems: {
          where: {
            isAvailable: true,
          },
          include: {
            variations: {
              orderBy: {
                displayOrder: 'asc',
              },
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
        variations: item.variations.map((variation) => ({
          id: variation.id,
          name: variation.name,
          priceModifier: parseFloat(variation.priceModifier.toString()),
          variationType: variation.variationType,
          isRequired: variation.isRequired,
          maxSelections: variation.maxSelections,
          displayOrder: variation.displayOrder,
        })),
      })),
    }));

    return NextResponse.json({ menu });
  } catch (error) {
    console.error('Menu fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
