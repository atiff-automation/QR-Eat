import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { restaurantId } = await params;

    // Verify staff has access to this restaurant
    const userRestaurantId = authResult.user.currentRole?.restaurantId;
    if (userRestaurantId !== restaurantId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'month'; // week, month, quarter, year
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const category = url.searchParams.get('category');

    // Calculate date range
    let startDate: Date;
    const endDate = new Date();

    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'quarter':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'year':
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'month':
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
    }

    // Top selling items by quantity
    const topSellingItems = await getTopSellingItems(restaurantId, startDate, endDate, limit, category);

    // Top revenue generating items
    const topRevenueItems = await getTopRevenueItems(restaurantId, startDate, endDate, limit, category);

    // Most frequently ordered items
    const mostFrequentItems = await getMostFrequentItems(restaurantId, startDate, endDate, limit, category);

    // Trending items (items with growing popularity)
    const trendingItems = await getTrendingItems(restaurantId, startDate, endDate, limit, category);

    // Underperforming items
    const underperformingItems = await getUnderperformingItems(restaurantId, startDate, endDate, limit, category);

    // Item performance by time of day
    const itemsByTimeOfDay = await getItemsByTimeOfDay(restaurantId, startDate, endDate);

    // Customer favorites (items with highest rating/repeat orders)
    const customerFavorites = await getCustomerFavorites(restaurantId, startDate, endDate, limit, category);

    return NextResponse.json({
      success: true,
      analytics: {
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        topSellingItems,
        topRevenueItems,
        mostFrequentItems,
        trendingItems,
        underperformingItems,
        itemsByTimeOfDay,
        customerFavorites
      }
    });

  } catch (error) {
    console.error('Failed to fetch popular items analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch popular items analytics' },
      { status: 500 }
    );
  }
}

async function getTopSellingItems(restaurantId: string, startDate: Date, endDate: Date, limit: number, category?: string) {
  const whereClause: any = {
    order: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    }
  };

  if (category) {
    whereClause.menuItem = {
      categoryId: category
    };
  }

  const topItems = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: whereClause,
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
    take: limit
  });

  // Get menu item details
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: topItems.map(item => item.menuItemId)
      }
    },
    include: {
      category: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return topItems.map(item => {
    const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
    return {
      menuItemId: item.menuItemId,
      name: menuItem?.name || 'Unknown',
      category: menuItem?.category.name || 'Unknown',
      price: menuItem?.price || 0,
      quantitySold: item._sum.quantity || 0,
      totalRevenue: Number(item._sum.totalAmount || 0),
      timesOrdered: item._count.id,
      averageOrderSize: item._count.id > 0 ? (item._sum.quantity || 0) / item._count.id : 0
    };
  });
}

async function getTopRevenueItems(restaurantId: string, startDate: Date, endDate: Date, limit: number, category?: string) {
  const whereClause: any = {
    order: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    }
  };

  if (category) {
    whereClause.menuItem = {
      categoryId: category
    };
  }

  const topItems = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: whereClause,
    _sum: {
      quantity: true,
      totalAmount: true
    },
    _count: {
      id: true
    },
    orderBy: {
      _sum: {
        totalAmount: 'desc'
      }
    },
    take: limit
  });

  // Get menu item details
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: topItems.map(item => item.menuItemId)
      }
    },
    include: {
      category: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return topItems.map(item => {
    const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
    return {
      menuItemId: item.menuItemId,
      name: menuItem?.name || 'Unknown',
      category: menuItem?.category.name || 'Unknown',
      price: menuItem?.price || 0,
      quantitySold: item._sum.quantity || 0,
      totalRevenue: Number(item._sum.totalAmount || 0),
      timesOrdered: item._count.id,
      averageRevenuePerOrder: item._count.id > 0 ? Number(item._sum.totalAmount || 0) / item._count.id : 0
    };
  });
}

async function getMostFrequentItems(restaurantId: string, startDate: Date, endDate: Date, limit: number, category?: string) {
  const whereClause: any = {
    order: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    }
  };

  if (category) {
    whereClause.menuItem = {
      categoryId: category
    };
  }

  const frequentItems = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: whereClause,
    _count: {
      id: true
    },
    _sum: {
      quantity: true,
      totalAmount: true
    },
    orderBy: {
      _count: {
        id: 'desc'
      }
    },
    take: limit
  });

  // Get menu item details
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: frequentItems.map(item => item.menuItemId)
      }
    },
    include: {
      category: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return frequentItems.map(item => {
    const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
    return {
      menuItemId: item.menuItemId,
      name: menuItem?.name || 'Unknown',
      category: menuItem?.category.name || 'Unknown',
      price: menuItem?.price || 0,
      orderFrequency: item._count.id,
      quantitySold: item._sum.quantity || 0,
      totalRevenue: Number(item._sum.totalAmount || 0),
      averageQuantityPerOrder: item._count.id > 0 ? (item._sum.quantity || 0) / item._count.id : 0
    };
  });
}

async function getTrendingItems(restaurantId: string, startDate: Date, endDate: Date, limit: number, category?: string) {
  // Split period into two halves to compare growth
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);

  const whereClauseFirst: any = {
    order: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lt: midDate
      },
      status: 'served'
    }
  };

  const whereClauseSecond: any = {
    order: {
      restaurantId,
      createdAt: {
        gte: midDate,
        lte: endDate
      },
      status: 'served'
    }
  };

  if (category) {
    whereClauseFirst.menuItem = { categoryId: category };
    whereClauseSecond.menuItem = { categoryId: category };
  }

  // First half of period
  const firstHalfItems = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: whereClauseFirst,
    _sum: {
      quantity: true
    },
    _count: {
      id: true
    }
  });

  // Second half of period
  const secondHalfItems = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: whereClauseSecond,
    _sum: {
      quantity: true
    },
    _count: {
      id: true
    }
  });

  // Calculate growth rates
  const itemGrowth = new Map();
  
  firstHalfItems.forEach(item => {
    itemGrowth.set(item.menuItemId, {
      firstHalf: item._sum.quantity || 0,
      secondHalf: 0,
      firstHalfOrders: item._count.id
    });
  });

  secondHalfItems.forEach(item => {
    const existing = itemGrowth.get(item.menuItemId) || { firstHalf: 0, secondHalf: 0, firstHalfOrders: 0 };
    existing.secondHalf = item._sum.quantity || 0;
    existing.secondHalfOrders = item._count.id;
    itemGrowth.set(item.menuItemId, existing);
  });

  // Calculate growth rates and filter trending items
  const trendingItemIds = Array.from(itemGrowth.entries())
    .map(([itemId, data]) => {
      const growthRate = data.firstHalf > 0 
        ? ((data.secondHalf - data.firstHalf) / data.firstHalf) * 100 
        : data.secondHalf > 0 ? 100 : 0;
      
      return {
        menuItemId: itemId,
        growthRate,
        firstHalfQuantity: data.firstHalf,
        secondHalfQuantity: data.secondHalf,
        totalQuantity: data.firstHalf + data.secondHalf
      };
    })
    .filter(item => item.growthRate > 0 && item.totalQuantity >= 3) // Minimum volume for trending
    .sort((a, b) => b.growthRate - a.growthRate)
    .slice(0, limit);

  // Get menu item details
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: trendingItemIds.map(item => item.menuItemId)
      }
    },
    include: {
      category: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return trendingItemIds.map(item => {
    const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
    return {
      menuItemId: item.menuItemId,
      name: menuItem?.name || 'Unknown',
      category: menuItem?.category.name || 'Unknown',
      price: menuItem?.price || 0,
      growthRate: Math.round(item.growthRate * 100) / 100,
      quantityGrowth: item.secondHalfQuantity - item.firstHalfQuantity,
      totalQuantity: item.totalQuantity,
      trendDirection: item.growthRate > 0 ? 'up' : 'down'
    };
  });
}

async function getUnderperformingItems(restaurantId: string, startDate: Date, endDate: Date, limit: number, category?: string) {
  // Get all available menu items
  const whereClause: any = {
    category: {
      restaurantId
    },
    isAvailable: true
  };

  if (category) {
    whereClause.categoryId = category;
  }

  const allItems = await prisma.menuItem.findMany({
    where: whereClause,
    include: {
      category: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  // Get order data for these items
  const orderData = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: {
      order: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'served'
      },
      menuItemId: {
        in: allItems.map(item => item.id)
      }
    },
    _sum: {
      quantity: true,
      totalAmount: true
    },
    _count: {
      id: true
    }
  });

  // Calculate performance metrics
  const itemPerformance = allItems.map(item => {
    const orderInfo = orderData.find(od => od.menuItemId === item.id);
    const quantitySold = orderInfo?._sum.quantity || 0;
    const revenue = Number(orderInfo?._sum.totalAmount || 0);
    const timesOrdered = orderInfo?._count.id || 0;

    return {
      menuItemId: item.id,
      name: item.name,
      category: item.category.name,
      price: item.price,
      quantitySold,
      revenue,
      timesOrdered,
      performanceScore: calculatePerformanceScore(quantitySold, revenue, item.price)
    };
  });

  // Sort by performance score (lowest first) and return underperforming items
  return itemPerformance
    .sort((a, b) => a.performanceScore - b.performanceScore)
    .slice(0, limit)
    .map(item => ({
      ...item,
      recommendedAction: getRecommendedAction(item)
    }));
}

function calculatePerformanceScore(quantity: number, revenue: number, price: number): number {
  // Simple performance score based on quantity sold and revenue potential
  const expectedRevenue = quantity * price;
  const revenueEfficiency = expectedRevenue > 0 ? revenue / expectedRevenue : 0;
  return quantity * 0.7 + revenueEfficiency * 0.3; // Weighted score
}

function getRecommendedAction(item: any): string {
  if (item.quantitySold === 0) return 'Consider removing or promoting heavily';
  if (item.quantitySold < 5) return 'Needs promotion or recipe review';
  if (item.timesOrdered < 3) return 'Consider bundling with popular items';
  return 'Monitor closely';
}

async function getItemsByTimeOfDay(restaurantId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.orderItem.findMany({
    where: {
      order: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'served'
      }
    },
    include: {
      order: {
        select: {
          createdAt: true
        }
      },
      menuItem: {
        select: {
          id: true,
          name: true,
          category: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  // Group by hour and menu item
  const timeSlots = ['Morning (6-11)', 'Lunch (11-15)', 'Afternoon (15-18)', 'Dinner (18-23)', 'Late Night (23-6)'];
  const timeAnalysis = new Map();

  orders.forEach(orderItem => {
    const hour = orderItem.order.createdAt.getHours();
    let timeSlot: string;
    
    if (hour >= 6 && hour < 11) timeSlot = timeSlots[0];
    else if (hour >= 11 && hour < 15) timeSlot = timeSlots[1];
    else if (hour >= 15 && hour < 18) timeSlot = timeSlots[2];
    else if (hour >= 18 && hour < 23) timeSlot = timeSlots[3];
    else timeSlot = timeSlots[4];

    const key = `${timeSlot}-${orderItem.menuItemId}`;
    const existing = timeAnalysis.get(key) || {
      timeSlot,
      menuItemId: orderItem.menuItemId,
      name: orderItem.menuItem.name,
      category: orderItem.menuItem.category.name,
      quantity: 0,
      orders: 0
    };

    existing.quantity += orderItem.quantity;
    existing.orders += 1;
    timeAnalysis.set(key, existing);
  });

  // Group by time slot and get top items for each
  const result = timeSlots.map(slot => {
    const slotItems = Array.from(timeAnalysis.values())
      .filter(item => item.timeSlot === slot)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      timeSlot: slot,
      topItems: slotItems
    };
  });

  return result;
}

async function getCustomerFavorites(restaurantId: string, startDate: Date, endDate: Date, limit: number, category?: string) {
  // For now, we'll use repeat order frequency as a proxy for customer favorites
  // In a full implementation, this could include customer ratings, reviews, etc.
  
  const whereClause: any = {
    order: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    }
  };

  if (category) {
    whereClause.menuItem = {
      categoryId: category
    };
  }

  // Get items ordered by multiple customers
  const repeatOrders = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: whereClause,
    _count: {
      id: true
    },
    _sum: {
      quantity: true
    },
    having: {
      id: {
        _count: {
          gte: 3 // Item ordered at least 3 times
        }
      }
    },
    orderBy: {
      _count: {
        id: 'desc'
      }
    },
    take: limit
  });

  // Get unique customers who ordered each item
  const itemCustomers = await Promise.all(
    repeatOrders.map(async (item) => {
      const uniqueCustomers = await prisma.orderItem.findMany({
        where: {
          menuItemId: item.menuItemId,
          order: {
            restaurantId,
            createdAt: {
              gte: startDate,
              lte: endDate
            },
            status: 'served'
          }
        },
        select: {
          order: {
            select: {
              customerSessionId: true
            }
          }
        },
        distinct: ['orderId']
      });

      return {
        menuItemId: item.menuItemId,
        uniqueCustomers: uniqueCustomers.length,
        totalOrders: item._count.id,
        totalQuantity: item._sum.quantity || 0
      };
    })
  );

  // Get menu item details
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: repeatOrders.map(item => item.menuItemId)
      }
    },
    include: {
      category: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return itemCustomers
    .map(item => {
      const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
      const repeatCustomerRate = item.uniqueCustomers > 0 ? (item.totalOrders / item.uniqueCustomers) : 0;
      
      return {
        menuItemId: item.menuItemId,
        name: menuItem?.name || 'Unknown',
        category: menuItem?.category.name || 'Unknown',
        price: menuItem?.price || 0,
        uniqueCustomers: item.uniqueCustomers,
        totalOrders: item.totalOrders,
        totalQuantity: item.totalQuantity,
        repeatCustomerRate: Math.round(repeatCustomerRate * 100) / 100,
        loyaltyScore: Math.round(repeatCustomerRate * item.uniqueCustomers * 100) / 100
      };
    })
    .sort((a, b) => b.loyaltyScore - a.loyaltyScore);
}