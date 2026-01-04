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
    const period = url.searchParams.get('period') || 'week'; // today, week, month, year
    const granularity = url.searchParams.get('granularity') || 'day'; // hour, day, week, month

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
      case 'year':
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'week':
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
    }

    // Order Analytics Query
    const orderAnalytics = await prisma.order.groupBy({
      by: ['status', 'createdAt'],
      where: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      },
      _sum: {
        totalAmount: true
      },
      _avg: {
        totalAmount: true
      }
    });

    // Order Status Distribution
    const statusDistribution = await prisma.order.groupBy({
      by: ['status'],
      where: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      },
      _sum: {
        totalAmount: true
      }
    });

    // Daily/Hourly Order Trends
    const orderTrends = await getOrderTrends(restaurantId, startDate, endDate, granularity);

    // Peak Hours Analysis
    const peakHours = await getPeakHours(restaurantId, startDate, endDate);

    // Average Order Value Over Time
    const avgOrderValue = await getAverageOrderValue(restaurantId, startDate, endDate, granularity);

    // Order Completion Times
    const completionTimes = await getOrderCompletionTimes(restaurantId, startDate, endDate);

    // Customer Analytics
    const customerAnalytics = await getCustomerAnalytics(restaurantId, startDate, endDate);

    // Table Performance
    const tablePerformance = await getTablePerformance(restaurantId, startDate, endDate);

    return NextResponse.json({
      success: true,
      analytics: {
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: {
          totalOrders: orderAnalytics.reduce((sum, item) => sum + item._count.id, 0),
          totalRevenue: orderAnalytics.reduce((sum, item) => sum + Number(item._sum.totalAmount || 0), 0),
          averageOrderValue: orderAnalytics.reduce((sum, item) => sum + Number(item._avg.totalAmount || 0), 0) / Math.max(orderAnalytics.length, 1),
          completedOrders: statusDistribution.find(s => s.status === 'SERVED')?._count.id || 0
        },
        statusDistribution: statusDistribution.map(item => ({
          status: item.status,
          count: item._count.id,
          revenue: Number(item._sum.totalAmount || 0)
        })),
        orderTrends,
        peakHours,
        avgOrderValue,
        completionTimes,
        customerAnalytics,
        tablePerformance
      }
    });

  } catch (error) {
    console.error('Failed to fetch order analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order analytics' },
      { status: 500 }
    );
  }
}

async function getOrderTrends(restaurantId: string, startDate: Date, endDate: Date, granularity: string) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    select: {
      createdAt: true,
      totalAmount: true,
      status: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  // Group by time period
  const groupedData = new Map();
  
  orders.forEach(order => {
    let key: string;
    const date = new Date(order.createdAt);
    
    switch (granularity) {
      case 'hour':
        key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${date.getMonth()}`;
        break;
      case 'day':
      default:
        key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        break;
    }

    if (!groupedData.has(key)) {
      groupedData.set(key, {
        period: key,
        orders: 0,
        revenue: 0,
        completedOrders: 0
      });
    }

    const data = groupedData.get(key);
    data.orders += 1;
    data.revenue += Number(order.totalAmount);
    if (order.status === 'SERVED') {
      data.completedOrders += 1;
    }
  });

  return Array.from(groupedData.values()).sort((a, b) => a.period.localeCompare(b.period));
}

async function getPeakHours(restaurantId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    select: {
      createdAt: true
    }
  });

  const hourCounts = new Array(24).fill(0);
  
  orders.forEach(order => {
    const hour = new Date(order.createdAt).getHours();
    hourCounts[hour]++;
  });

  return hourCounts.map((count, hour) => ({
    hour,
    orders: count,
    period: `${hour.toString().padStart(2, '0')}:00`
  }));
}

async function getAverageOrderValue(restaurantId: string, startDate: Date, endDate: Date, granularity: string) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'SERVED'
    },
    select: {
      createdAt: true,
      totalAmount: true
    }
  });

  const groupedData = new Map();
  
  orders.forEach(order => {
    let key: string;
    const date = new Date(order.createdAt);
    
    switch (granularity) {
      case 'hour':
        key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${date.getMonth()}`;
        break;
      case 'day':
      default:
        key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        break;
    }

    if (!groupedData.has(key)) {
      groupedData.set(key, {
        period: key,
        totalRevenue: 0,
        orderCount: 0
      });
    }

    const data = groupedData.get(key);
    data.totalRevenue += Number(order.totalAmount);
    data.orderCount += 1;
  });

  return Array.from(groupedData.values()).map(data => ({
    period: data.period,
    averageOrderValue: data.orderCount > 0 ? data.totalRevenue / data.orderCount : 0,
    orderCount: data.orderCount
  })).sort((a, b) => a.period.localeCompare(b.period));
}

async function getOrderCompletionTimes(restaurantId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'SERVED',
      confirmedAt: {
        not: null
      },
      servedAt: {
        not: null
      }
    },
    select: {
      confirmedAt: true,
      servedAt: true,
      totalAmount: true
    }
  });

  const completionTimes = orders.map(order => {
    if (order.confirmedAt && order.servedAt) {
      return {
        completionTime: Math.round((order.servedAt.getTime() - order.confirmedAt.getTime()) / 60000), // minutes
        orderValue: Number(order.totalAmount)
      };
    }
    return null;
  }).filter(Boolean);

  const avgCompletionTime = completionTimes.length > 0 
    ? completionTimes.reduce((sum, item) => sum + item!.completionTime, 0) / completionTimes.length 
    : 0;

  return {
    averageCompletionTime: Math.round(avgCompletionTime),
    completionTimeDistribution: getCompletionTimeDistribution(completionTimes),
    totalCompletedOrders: completionTimes.length
  };
}

function getCompletionTimeDistribution(completionTimes: Array<{completionTime: number, orderValue: number}>) {
  const ranges = [
    { min: 0, max: 15, label: '0-15 min' },
    { min: 15, max: 30, label: '15-30 min' },
    { min: 30, max: 45, label: '30-45 min' },
    { min: 45, max: 60, label: '45-60 min' },
    { min: 60, max: Infinity, label: '60+ min' }
  ];

  return ranges.map(range => {
    const ordersInRange = completionTimes.filter(ct => 
      ct.completionTime >= range.min && ct.completionTime < range.max
    );

    return {
      range: range.label,
      count: ordersInRange.length,
      percentage: completionTimes.length > 0 ? (ordersInRange.length / completionTimes.length) * 100 : 0
    };
  });
}

async function getCustomerAnalytics(restaurantId: string, startDate: Date, endDate: Date) {
  const sessions = await prisma.customerSession.findMany({
    where: {
      table: {
        restaurantId
      },
      startedAt: {
        gte: startDate,
        lte: endDate
      }
    },
    include: {
      orders: {
        select: {
          totalAmount: true,
          status: true
        }
      }
    }
  });

  const totalSessions = sessions.length;
  const sessionsWithOrders = sessions.filter(s => s.orders.length > 0).length;
  const conversionRate = totalSessions > 0 ? (sessionsWithOrders / totalSessions) * 100 : 0;

  const repeatCustomers = sessions.filter(s => s.orders.length > 1).length;
  const repeatRate = sessionsWithOrders > 0 ? (repeatCustomers / sessionsWithOrders) * 100 : 0;

  return {
    totalSessions,
    sessionsWithOrders,
    conversionRate: Math.round(conversionRate * 100) / 100,
    repeatCustomers,
    repeatRate: Math.round(repeatRate * 100) / 100,
    averageSessionValue: sessionsWithOrders > 0 
      ? sessions.reduce((sum, s) => sum + s.orders.reduce((orderSum, o) => orderSum + Number(o.totalAmount), 0), 0) / sessionsWithOrders 
      : 0
  };
}

async function getTablePerformance(restaurantId: string, startDate: Date, endDate: Date) {
  const tableStats = await prisma.table.findMany({
    where: {
      restaurantId
    },
    include: {
      customerSessions: {
        where: {
          startedAt: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          orders: {
            select: {
              totalAmount: true,
              status: true
            }
          }
        }
      }
    }
  });

  return tableStats.map(table => {
    const sessions = table.customerSessions;
    const totalRevenue = sessions.reduce((sum, s) => 
      sum + s.orders.reduce((orderSum, o) => orderSum + Number(o.totalAmount), 0), 0
    );
    const totalOrders = sessions.reduce((sum, s) => sum + s.orders.length, 0);

    return {
      tableId: table.id,
      tableNumber: table.tableNumber,
      tableName: table.tableName,
      sessions: sessions.length,
      orders: totalOrders,
      revenue: totalRevenue,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
    };
  }).sort((a, b) => b.revenue - a.revenue);
}