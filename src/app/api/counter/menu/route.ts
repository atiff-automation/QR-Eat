import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';

/**
 * GET /api/counter/menu
 *
 * Authenticated, tenant-scoped menu for Counter order entry. The website
 * remains the menu editor; the Counter only reads the current active menu.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'menu', 'read');

    const restaurantId = context!.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const [restaurant, categories] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          name: true,
          currency: true,
          taxLabel: true,
          serviceChargeLabel: true,
          isActive: true,
        },
      }),
      prisma.menuCategory.findMany({
        where: {
          restaurantId,
          status: 'ACTIVE',
          isActive: true,
        },
        include: {
          menuItems: {
            where: { status: 'ACTIVE', isAvailable: true },
            include: {
              variationGroups: {
                orderBy: { displayOrder: 'asc' },
                include: {
                  options: {
                    orderBy: { displayOrder: 'asc' },
                  },
                },
              },
            },
            orderBy: { displayOrder: 'asc' },
          },
        },
        orderBy: { displayOrder: 'asc' },
      }),
    ]);

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      );
    }
    if (!restaurant.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: 'Restaurant is currently closed',
          code: 'RESTAURANT_CLOSED',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          currency: restaurant.currency,
          taxLabel: restaurant.taxLabel || 'Tax',
          serviceChargeLabel: restaurant.serviceChargeLabel || 'Service Charge',
        },
        categories: categories
          .filter((category) => category.menuItems.length > 0)
          .map((category) => ({
            id: category.id,
            name: category.name,
            description: category.description,
            displayOrder: category.displayOrder,
            items: category.menuItems.map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              price: item.price.toString(),
              imageUrl: item.imageUrl,
              preparationTime: item.preparationTime,
              calories: item.calories,
              allergens: item.allergens,
              dietaryInfo: item.dietaryInfo,
              isAvailable: item.isAvailable,
              isFeatured: item.isFeatured,
              displayOrder: item.displayOrder,
              variationGroups: item.variationGroups.map((group) => ({
                id: group.id,
                name: group.name,
                minSelections: group.minSelections,
                maxSelections: group.maxSelections,
                displayOrder: group.displayOrder,
                options: group.options.map((option) => ({
                  id: option.id,
                  name: option.name,
                  priceModifier: option.priceModifier.toString(),
                  isAvailable: option.isAvailable,
                  displayOrder: option.displayOrder,
                })),
              })),
            })),
          })),
        serverTime: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    console.error('[CounterMenu] Error:', error);
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 403 }
        );
      }
    }
    return NextResponse.json(
      { success: false, error: 'Failed to load the Counter menu' },
      { status: 500 }
    );
  }
}
