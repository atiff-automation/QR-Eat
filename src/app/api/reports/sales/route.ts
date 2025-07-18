import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { 
  getTenantContext, 
  requireAuth, 
  requirePermission, 
  createRestaurantFilter 
} from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    const context = getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'analytics', 'read');

    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const restaurantId = url.searchParams.get('restaurantId');
    const groupBy = url.searchParams.get('groupBy') || 'day'; // day, week, month

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let where: any = {
      createdAt: {
        gte: start,
        lte: end
      },
      status: { in: ['completed', 'paid'] }
    };

    // Apply restaurant filter based on user type
    const restaurantFilter = createRestaurantFilter(context!);
    where = { ...where, ...restaurantFilter };

    // Platform admins can filter by specific restaurant
    if (context!.isAdmin && restaurantId) {
      where = {
        createdAt: {
          gte: start,
          lte: end
        },
        status: { in: ['completed', 'paid'] },
        restaurantId
      };
    }

    // Get sales data
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        totalAmount: true,
        subtotalAmount: true,
        taxAmount: true,
        serviceCharge: true,
        discountAmount: true,
        createdAt: true,
        restaurantId: true,
        restaurant: context!.isAdmin ? {
          select: {
            name: true,
            slug: true
          }
        } : false,
        items: {
          include: {
            menuItem: {
              select: {
                name: true,
                categoryId: true,
                category: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Calculate aggregated metrics
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalTax = orders.reduce((sum, order) => sum + Number(order.taxAmount || 0), 0);
    const totalServiceCharge = orders.reduce((sum, order) => sum + Number(order.serviceCharge || 0), 0);
    const totalDiscount = orders.reduce((sum, order) => sum + Number(order.discountAmount || 0), 0);

    // Group data by time period
    const salesByPeriod = groupSalesByPeriod(orders, groupBy);

    // Top selling items
    const itemSales = new Map<string, { name: string; quantity: number; revenue: number; category: string }>();
    
    orders.forEach(order => {
      order.items.forEach(item => {
        const itemName = item.menuItem.name;
        const category = item.menuItem.category?.name || 'Uncategorized';
        const existing = itemSales.get(itemName) || { name: itemName, quantity: 0, revenue: 0, category };
        
        existing.quantity += item.quantity;
        existing.revenue += Number(item.unitPrice) * item.quantity;
        itemSales.set(itemName, existing);
      });
    });

    const topSellingItems = Array.from(itemSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Sales by category
    const categorySales = new Map<string, { name: string; revenue: number; orders: number }>();
    
    orders.forEach(order => {
      order.items.forEach(item => {
        const categoryName = item.menuItem.category?.name || 'Uncategorized';
        const existing = categorySales.get(categoryName) || { name: categoryName, revenue: 0, orders: 0 };
        
        existing.revenue += Number(item.unitPrice) * item.quantity;
        categorySales.set(categoryName, existing);
      });
    });

    // Count unique orders per category
    categorySales.forEach((category, categoryName) => {
      const uniqueOrders = new Set();
      orders.forEach(order => {
        order.items.forEach(item => {
          if (item.menuItem.category?.name === categoryName) {
            uniqueOrders.add(order.id);
          }
        });
      });
      category.orders = uniqueOrders.size;
    });

    const salesByCategory = Array.from(categorySales.values())
      .sort((a, b) => b.revenue - a.revenue);

    // Sales by restaurant (for platform admins)
    let salesByRestaurant: any[] = [];
    if (context!.isAdmin) {
      const restaurantSales = new Map<string, { id: string; name: string; revenue: number; orders: number }>();
      
      orders.forEach(order => {
        const restaurant = order.restaurant;
        if (restaurant) {
          const existing = restaurantSales.get(order.restaurantId) || {
            id: order.restaurantId,
            name: restaurant.name,
            revenue: 0,
            orders: 0
          };
          
          existing.revenue += Number(order.totalAmount);
          existing.orders += 1;
          restaurantSales.set(order.restaurantId, existing);
        }
      });

      salesByRestaurant = Array.from(restaurantSales.values())
        .sort((a, b) => b.revenue - a.revenue);
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalOrders,
          averageOrderValue,
          totalTax,
          totalServiceCharge,
          totalDiscount,
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
            days: Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
          }
        },
        salesByPeriod,
        topSellingItems,
        salesByCategory,
        salesByRestaurant: context!.isAdmin ? salesByRestaurant : undefined
      }
    });

  } catch (error) {
    console.error('Failed to generate sales report:', error);
    
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
      { error: 'Failed to generate sales report' },
      { status: 500 }
    );
  }
}

function groupSalesByPeriod(orders: any[], groupBy: string) {
  const groupedData = new Map<string, { date: string; revenue: number; orders: number }>();

  orders.forEach(order => {
    let key: string;
    const date = new Date(order.createdAt);

    switch (groupBy) {
      case 'hour':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
        break;
      case 'day':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate()) / 7)).padStart(2, '0')}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    const existing = groupedData.get(key) || { date: key, revenue: 0, orders: 0 };
    existing.revenue += Number(order.totalAmount);
    existing.orders += 1;
    groupedData.set(key, existing);
  });

  return Array.from(groupedData.values()).sort((a, b) => a.date.localeCompare(b.date));
}