import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
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

    // Get restaurant ID from RBAC payload
    const restaurantId = authResult.user.currentRole?.restaurantId;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant access required' },
        { status: 403 }
      );
    }

    const hasMenuPermission =
      authResult.user.permissions.includes('menu:write');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    type ImportRow = Record<string, string | undefined>;
    type ImportMapping = Record<string, string>;

    const body = (await request.json()) as {
      csvData?: ImportRow[];
      mapping?: ImportMapping;
    };
    const { csvData, mapping } = body;

    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      return NextResponse.json(
        { error: 'CSV data is required' },
        { status: 400 }
      );
    }

    if (!mapping || !mapping.name || !mapping.price || !mapping.category) {
      return NextResponse.json(
        { error: 'Column mapping for name, price, and category is required' },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    const categoryCache = new Map<string, string>();
    const nameColumn = mapping.name;
    const priceColumn = mapping.price;
    const categoryColumn = mapping.category;

    // Process each row
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      if (!row) continue;

      const cell = (column?: string): string | undefined =>
        column ? row[column] : undefined;

      try {
        // Extract data based on mapping
        const name = cell(nameColumn)?.trim();
        const price = parseFloat(cell(priceColumn) ?? '');
        const categoryName = cell(categoryColumn)?.trim();
        const description = cell(mapping.description)?.trim() ?? null;
        const preparationTime =
          parseInt(cell(mapping.preparationTime) ?? '') || 15;
        const caloriesValue = cell(mapping.calories);
        const calories = caloriesValue ? parseInt(caloriesValue) : null;
        const allergensValue = cell(mapping.allergens);
        const allergens = allergensValue
          ? allergensValue
              .split(',')
              .map((a: string) => a.trim())
              .filter(Boolean)
          : [];
        const dietaryValue = cell(mapping.dietaryInfo);
        const dietaryInfo = dietaryValue
          ? dietaryValue
              .split(',')
              .map((d: string) => d.trim())
              .filter(Boolean)
          : [];

        // Validate required fields
        if (!name || isNaN(price) || !categoryName) {
          results.failed++;
          results.errors.push(
            `Row ${i + 1}: Missing required fields (name, price, category)`
          );
          continue;
        }

        // Get or create category
        let categoryId = categoryCache.get(categoryName);
        if (!categoryId) {
          let category = await prisma.menuCategory.findFirst({
            where: {
              name: categoryName,
              restaurantId,
            },
          });

          if (!category) {
            // Create new category
            category = await prisma.menuCategory.create({
              data: {
                restaurantId,
                name: categoryName,
                description: `Auto-created category for ${categoryName}`,
                displayOrder: await getNextCategoryDisplayOrder(restaurantId),
                isActive: true,
              },
            });
          }

          categoryId = category.id;
          categoryCache.set(categoryName, categoryId);
        }

        // Get next display order
        const lastItem = await prisma.menuItem.findFirst({
          where: { categoryId },
          orderBy: { displayOrder: 'desc' },
        });
        const displayOrder = (lastItem?.displayOrder || 0) + 1;

        // Create menu item
        await prisma.menuItem.create({
          data: {
            restaurantId,
            categoryId,
            name,
            description,
            price,
            preparationTime,
            calories,
            allergens,
            dietaryInfo,
            isAvailable: true,
            isFeatured: false,
            displayOrder,
          },
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Import completed: ${results.success} items created, ${results.failed} failed`,
    });
  } catch (error) {
    console.error('Failed to import menu items:', error);
    return NextResponse.json(
      { error: 'Failed to import menu items' },
      { status: 500 }
    );
  }
}

async function getNextCategoryDisplayOrder(
  restaurantId: string
): Promise<number> {
  const lastCategory = await prisma.menuCategory.findFirst({
    where: { restaurantId },
    orderBy: { displayOrder: 'desc' },
  });
  return (lastCategory?.displayOrder || 0) + 1;
}
