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
    const period = url.searchParams.get('period') || 'week'; // today, week, month
    const categoryId = url.searchParams.get('categoryId');

    // Calculate date range
    let startDate: Date;
    const endDate = new Date();

    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'week':
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
    }

    // Base filter for restaurant
    const baseWhere = {
      order: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        status: {
          not: 'CANCELLED'
        }
      }
    };

    // Add category filter if specified
    if (categoryId) {
      baseWhere.menuItem = {
        categoryId
      };
    }

    // Get top selling items
    const topSellingItems = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: baseWhere,
      _sum: {
        quantity: true,
        totalAmount: true
      },
      _count: {
        id: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: 10
    });

    // Get menu item details for top selling items
    const topItemsWithDetails = await Promise.all(
      topSellingItems.map(async (item) => {
        const menuItem = await prisma.menuItem.findUnique({
          where: { id: item.menuItemId },
          select: {
            id: true,
            name: true,
            price: true,
            imageUrl: true,
            category: {
              select: {
                name: true
              }
            }
          }
        });
        return {
          ...item,
          menuItem
        };
      })
    );

    // Get revenue by category
    const categoryRevenue = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: {
          restaurantId,
          createdAt: {
            gte: startDate,
            lte: endDate
          },
          status: {
            not: 'CANCELLED'
          }
        }
      },
      _sum: {
        totalAmount: true,
        quantity: true
      },
      _count: {
        id: true
      }
    });

    // Group by category
    const categoryMap = new Map();
    
    for (const item of categoryRevenue) {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId },
        select: {
          category: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (menuItem?.category) {
        const categoryId = menuItem.category.id;
        const existing = categoryMap.get(categoryId) || {
          categoryId,
          categoryName: menuItem.category.name,
          totalRevenue: 0,
          totalQuantity: 0,
          orderCount: 0
        };

        existing.totalRevenue += Number(item._sum.totalAmount || 0);
        existing.totalQuantity += item._sum.quantity || 0;
        existing.orderCount += item._count.id || 0;

        categoryMap.set(categoryId, existing);
      }
    }

    const categoryStats = Array.from(categoryMap.values()).sort(
      (a, b) => b.totalRevenue - a.totalRevenue
    );

    // Get menu performance metrics
    const totalMenuItems = await prisma.menuItem.count({
      where: {
        category: {
          restaurantId
        }
      }
    });

    const activeMenuItems = await prisma.menuItem.count({
      where: {
        category: {
          restaurantId
        },
        isAvailable: true
      }
    });

    const orderedItemsCount = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: baseWhere,
      _count: {
        menuItemId: true
      }
    });

    // Get low performing items (items with no orders in period)
    const orderedItemIds = orderedItemsCount.map(item => item.menuItemId);
    const lowPerformingItems = await prisma.menuItem.findMany({
      where: {
        category: {
          restaurantId
        },
        isAvailable: true,
        id: {
          notIn: orderedItemIds
        }
      },
      select: {
        id: true,
        name: true,
        price: true,
        category: {
          select: {
            name: true
          }
        }
      },
      take: 10
    });

    // Calculate average order value for menu items
    const avgOrderValue = await prisma.orderItem.aggregate({
      where: baseWhere,
      _avg: {
        totalAmount: true
      }
    });

    // Get hourly performance (for today only)
    let hourlyPerformance = [];
    if (period === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayOrders = await prisma.orderItem.findMany({
        where: {
          order: {
            restaurantId,
            createdAt: {
              gte: todayStart,
              lte: todayEnd
            },
            status: {
              not: 'CANCELLED'
            }
          }
        },
        select: {
          totalAmount: true,
          quantity: true,
          order: {
            select: {
              createdAt: true
            }
          }
        }
      });

      // Group by hour
      const hourlyMap = new Map();
      todayOrders.forEach(item => {
        const hour = item.order.createdAt.getHours();
        const existing = hourlyMap.get(hour) || {
          hour,
          revenue: 0,
          quantity: 0,
          orders: 0
        };

        existing.revenue += Number(item.totalAmount);
        existing.quantity += item.quantity;
        existing.orders += 1;

        hourlyMap.set(hour, existing);
      });

      hourlyPerformance = Array.from(hourlyMap.values()).sort((a, b) => a.hour - b.hour);
    }

    const analytics = {
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      summary: {
        totalMenuItems,
        activeMenuItems,
        itemsOrdered: orderedItemsCount.length,
        itemsNotOrdered: totalMenuItems - orderedItemsCount.length,
        averageOrderValue: Number(avgOrderValue._avg.totalAmount || 0)
      },
      topSellingItems: topItemsWithDetails,
      categoryPerformance: categoryStats,
      lowPerformingItems,
      hourlyPerformance
    };

    return NextResponse.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('Failed to fetch menu analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}