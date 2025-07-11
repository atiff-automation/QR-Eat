import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
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

    const { csvData, mapping } = await request.json();

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
      errors: []
    };

    const categoryCache = new Map();

    // Process each row
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      
      try {
        // Extract data based on mapping
        const name = row[mapping.name]?.trim();
        const price = parseFloat(row[mapping.price]);
        const categoryName = row[mapping.category]?.trim();
        const description = mapping.description ? row[mapping.description]?.trim() : null;
        const preparationTime = mapping.preparationTime ? 
          parseInt(row[mapping.preparationTime]) || 15 : 15;
        const calories = mapping.calories && row[mapping.calories] ? 
          parseInt(row[mapping.calories]) : null;
        const allergens = mapping.allergens && row[mapping.allergens] ? 
          row[mapping.allergens].split(',').map(a => a.trim()).filter(Boolean) : [];
        const dietaryInfo = mapping.dietaryInfo && row[mapping.dietaryInfo] ? 
          row[mapping.dietaryInfo].split(',').map(d => d.trim()).filter(Boolean) : [];

        // Validate required fields
        if (!name || isNaN(price) || !categoryName) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing required fields (name, price, category)`);
          continue;
        }

        // Get or create category
        let categoryId = categoryCache.get(categoryName);
        if (!categoryId) {
          let category = await prisma.menuCategory.findFirst({
            where: {
              name: categoryName,
              restaurantId: authResult.staff.restaurantId
            }
          });

          if (!category) {
            // Create new category
            category = await prisma.menuCategory.create({
              data: {
                restaurantId: authResult.staff.restaurantId,
                name: categoryName,
                description: `Auto-created category for ${categoryName}`,
                displayOrder: await getNextCategoryDisplayOrder(authResult.staff.restaurantId),
                isActive: true
              }
            });
          }

          categoryId = category.id;
          categoryCache.set(categoryName, categoryId);
        }

        // Get next display order
        const lastItem = await prisma.menuItem.findFirst({
          where: { categoryId },
          orderBy: { displayOrder: 'desc' }
        });
        const displayOrder = (lastItem?.displayOrder || 0) + 1;

        // Create menu item
        await prisma.menuItem.create({
          data: {
            restaurantId: authResult.staff.restaurantId,
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
            displayOrder
          }
        });

        results.success++;

      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Import completed: ${results.success} items created, ${results.failed} failed`
    });

  } catch (error) {
    console.error('Failed to import menu items:', error);
    return NextResponse.json(
      { error: 'Failed to import menu items' },
      { status: 500 }
    );
  }
}

async function getNextCategoryDisplayOrder(restaurantId: string): Promise<number> {
  const lastCategory = await prisma.menuCategory.findFirst({
    where: { restaurantId },
    orderBy: { displayOrder: 'desc' }
  });
  return (lastCategory?.displayOrder || 0) + 1;
}