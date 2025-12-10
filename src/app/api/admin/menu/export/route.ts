import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
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

    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'json'; // json, csv
    const categoryId = url.searchParams.get('categoryId');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    const whereClause: any = {
      category: {
        restaurantId
      }
    };

    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    if (!includeInactive) {
      whereClause.isAvailable = true;
    }

    const menuItems = await prisma.menuItem.findMany({
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

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = [
        'ID',
        'Name',
        'Description', 
        'Category',
        'Price',
        'Preparation Time (min)',
        'Calories',
        'Allergens',
        'Dietary Info',
        'Available',
        'Featured',
        'Display Order',
        'Variations Count'
      ];

      const csvRows = menuItems.map(item => [
        item.id,
        `"${item.name.replace(/"/g, '""')}"`,
        item.description ? `"${item.description.replace(/"/g, '""')}"` : '',
        `"${item.category.name.replace(/"/g, '""')}"`,
        item.price,
        item.preparationTime,
        item.calories || '',
        item.allergens.length > 0 ? `"${item.allergens.join(', ')}"` : '',
        item.dietaryInfo.length > 0 ? `"${item.dietaryInfo.join(', ')}"` : '',
        item.isAvailable ? 'Yes' : 'No',
        item.isFeatured ? 'Yes' : 'No',
        item.displayOrder,
        item.variations.length
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.join(','))
      ].join('\n');

      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="menu-export-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    // Return JSON format
    const exportData = {
      exportDate: new Date().toISOString(),
      restaurant: {
        id: restaurantId,
        name: authResult.user.currentRole?.restaurantName
      },
      summary: {
        totalItems: menuItems.length,
        activeItems: menuItems.filter(item => item.isAvailable).length,
        featuredItems: menuItems.filter(item => item.isFeatured).length,
        categories: [...new Set(menuItems.map(item => item.category.name))].length
      },
      menuItems: menuItems.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: {
          id: item.category.id,
          name: item.category.name
        },
        price: item.price,
        imageUrl: item.imageUrl,
        preparationTime: item.preparationTime,
        calories: item.calories,
        allergens: item.allergens,
        dietaryInfo: item.dietaryInfo,
        isAvailable: item.isAvailable,
        isFeatured: item.isFeatured,
        displayOrder: item.displayOrder,
        variations: item.variations.map(variation => ({
          id: variation.id,
          name: variation.name,
          priceModifier: variation.priceModifier,
          variationType: variation.variationType,
          isRequired: variation.isRequired,
          maxSelections: variation.maxSelections,
          displayOrder: variation.displayOrder
        })),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    };

    if (format === 'download') {
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="menu-export-${new Date().toISOString().split('T')[0]}.json"`
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Failed to export menu:', error);
    return NextResponse.json(
      { error: 'Failed to export menu' },
      { status: 500 }
    );
  }
}