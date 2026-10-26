import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getCachedPublicMenu } from '@/lib/cache/menu-cache';

/**
 * GET /api/menu/{restaurantId}
 *
 * Public QR menu. Unavailable ("86") items are deliberately removed from the
 * response. The data query is cached server-side for a short period and
 * invalidated when availability changes; the HTTP response itself must not be
 * cached because an already-open customer menu can otherwise show a sold-out
 * item for a long time.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  try {
    const { restaurantId } = await params;

    const menu = await getCachedPublicMenu(restaurantId, async () => {
      const categories = await prisma.menuCategory.findMany({
        where: {
          restaurantId,
          status: 'ACTIVE',
        },
        include: {
          menuItems: {
            where: {
              status: 'ACTIVE',
              isAvailable: true,
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

      // Transform data here so only plain, cache-safe values enter the data
      // cache. Prisma Decimal values are intentionally converted to numbers.
      return categories
        .map((category) => ({
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
        }))
        .filter((category) => category.menuItems.length > 0);
    });

    if (menu.length === 0) {
      return NextResponse.json({ error: 'No menu available' }, { status: 404 });
    }

    return NextResponse.json(
      { menu },
      {
        headers: {
          'Cache-Control': 'private, no-store',
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
