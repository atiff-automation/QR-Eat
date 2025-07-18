import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { restaurantId } = await params;

    // Verify staff has access to this restaurant
    if (authResult.staff.restaurantId !== restaurantId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'month'; // week, month, quarter, year
    const granularity = url.searchParams.get('granularity') || 'day'; // day, week, month

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

    // Revenue Analytics
    const revenueData = await getRevenueAnalytics(restaurantId, startDate, endDate, granularity);

    // Revenue by Category
    const categoryRevenue = await getCategoryRevenue(restaurantId, startDate, endDate);

    // Revenue by Payment Method
    const paymentMethodRevenue = await getPaymentMethodRevenue(restaurantId, startDate, endDate);

    // Revenue Growth
    const revenueGrowth = await getRevenueGrowth(restaurantId, startDate, endDate, period);

    // Revenue Forecasting
    const revenueForecast = await getRevenueForecast(restaurantId, startDate, endDate);

    // Tax Analytics
    const taxAnalytics = await getTaxAnalytics(restaurantId, startDate, endDate);

    // Refund Analytics
    const refundAnalytics = await getRefundAnalytics(restaurantId, startDate, endDate);

    return NextResponse.json({
      success: true,
      analytics: {
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: {
          totalRevenue: revenueData.totalRevenue,
          averageOrderValue: revenueData.averageOrderValue,
          totalOrders: revenueData.totalOrders,
          revenueGrowth: revenueGrowth.growthRate
        },
        revenueOverTime: revenueData.revenueOverTime,
        categoryRevenue,
        paymentMethodRevenue,
        revenueGrowth,
        revenueForecast,
        taxAnalytics,
        refundAnalytics
      }
    });

  } catch (error) {
    console.error('Failed to fetch revenue analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revenue analytics' },
      { status: 500 }
    );
  }
}

async function getRevenueAnalytics(restaurantId: string, startDate: Date, endDate: Date, granularity: string) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    },
    select: {
      createdAt: true,
      totalAmount: true,
      subtotalAmount: true,
      taxAmount: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Group by time period
  const groupedData = new Map();
  
  orders.forEach(order => {
    let key: string;
    const date = new Date(order.createdAt);
    
    switch (granularity) {
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
        revenue: 0,
        orders: 0,
        subtotalAmount: 0,
        tax: 0
      });
    }

    const data = groupedData.get(key);
    data.revenue += Number(order.totalAmount);
    data.subtotalAmount += Number(order.subtotalAmount || 0);
    data.tax += Number(order.taxAmount || 0);
    data.orders += 1;
  });

  const revenueOverTime = Array.from(groupedData.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(data => ({
      ...data,
      averageOrderValue: data.orders > 0 ? data.revenue / data.orders : 0
    }));

  return {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    revenueOverTime
  };
}

async function getCategoryRevenue(restaurantId: string, startDate: Date, endDate: Date) {
  const categoryData = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
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
    _sum: {
      totalAmount: true,
      quantity: true
    }
  });

  // Get menu item details with categories
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: categoryData.map(item => item.menuItemId)
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

  // Group by category
  const categoryMap = new Map();
  
  categoryData.forEach(item => {
    const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
    if (menuItem?.category) {
      const categoryId = menuItem.category.id;
      const existing = categoryMap.get(categoryId) || {
        categoryId,
        categoryName: menuItem.category.name,
        revenue: 0,
        quantity: 0,
        items: 0
      };

      existing.revenue += Number(item._sum.totalAmount || 0);
      existing.quantity += item._sum.quantity || 0;
      existing.items += 1;

      categoryMap.set(categoryId, existing);
    }
  });

  return Array.from(categoryMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map(category => ({
      ...category,
      percentage: 0 // Will be calculated on frontend
    }));
}

async function getPaymentMethodRevenue(restaurantId: string, startDate: Date, endDate: Date) {
  const paymentData = await prisma.payment.groupBy({
    by: ['paymentMethod'],
    where: {
      order: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'served'
      },
      status: 'completed'
    },
    _sum: {
      amount: true
    },
    _count: {
      id: true
    }
  });

  return paymentData.map(payment => ({
    method: payment.paymentMethod,
    revenue: Number(payment._sum.amount || 0),
    transactions: payment._count.id
  })).sort((a, b) => b.revenue - a.revenue);
}

async function getRevenueGrowth(restaurantId: string, startDate: Date, endDate: Date, period: string) {
  // Calculate previous period for comparison
  const periodDuration = endDate.getTime() - startDate.getTime();
  const previousEndDate = new Date(startDate.getTime() - 1);
  const previousStartDate = new Date(startDate.getTime() - periodDuration);

  // Current period revenue
  const currentRevenue = await prisma.order.aggregate({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    },
    _sum: {
      totalAmount: true
    },
    _count: {
      id: true
    }
  });

  // Previous period revenue
  const previousRevenue = await prisma.order.aggregate({
    where: {
      restaurantId,
      createdAt: {
        gte: previousStartDate,
        lte: previousEndDate
      },
      status: 'served'
    },
    _sum: {
      totalAmount: true
    },
    _count: {
      id: true
    }
  });

  const currentTotal = Number(currentRevenue._sum.totalAmount || 0);
  const previousTotal = Number(previousRevenue._sum.totalAmount || 0);
  
  const growthRate = previousTotal > 0 
    ? ((currentTotal - previousTotal) / previousTotal) * 100 
    : 0;

  const orderGrowthRate = previousRevenue._count.id > 0
    ? ((currentRevenue._count.id - previousRevenue._count.id) / previousRevenue._count.id) * 100
    : 0;

  return {
    currentPeriod: {
      revenue: currentTotal,
      orders: currentRevenue._count.id
    },
    previousPeriod: {
      revenue: previousTotal,
      orders: previousRevenue._count.id
    },
    growthRate: Math.round(growthRate * 100) / 100,
    orderGrowthRate: Math.round(orderGrowthRate * 100) / 100,
    revenueChange: currentTotal - previousTotal
  };
}

async function getRevenueForecast(restaurantId: string, startDate: Date, endDate: Date) {
  // Simple linear regression forecast based on recent trends
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    },
    select: {
      createdAt: true,
      totalAmount: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  if (orders.length < 7) {
    return {
      forecast: [],
      confidence: 'low',
      message: 'Insufficient data for forecasting'
    };
  }

  // Group by day
  const dailyRevenue = new Map();
  orders.forEach(order => {
    const dateKey = order.createdAt.toISOString().split('T')[0];
    const existing = dailyRevenue.get(dateKey) || 0;
    dailyRevenue.set(dateKey, existing + Number(order.totalAmount));
  });

  const dataPoints = Array.from(dailyRevenue.entries()).map(([date, revenue], index) => ({
    x: index,
    y: revenue,
    date
  }));

  // Simple moving average for next 7 days
  const recentDays = Math.min(7, dataPoints.length);
  const averageDailyRevenue = dataPoints
    .slice(-recentDays)
    .reduce((sum, point) => sum + point.y, 0) / recentDays;

  const forecast = [];
  for (let i = 1; i <= 7; i++) {
    const forecastDate = new Date(endDate);
    forecastDate.setDate(forecastDate.getDate() + i);
    
    forecast.push({
      date: forecastDate.toISOString().split('T')[0],
      predictedRevenue: Math.round(averageDailyRevenue * 100) / 100,
      confidence: recentDays >= 7 ? 'high' : 'medium'
    });
  }

  return {
    forecast,
    confidence: recentDays >= 7 ? 'high' : 'medium',
    averageDailyRevenue: Math.round(averageDailyRevenue * 100) / 100
  };
}

async function getTaxAnalytics(restaurantId: string, startDate: Date, endDate: Date) {
  const taxData = await prisma.order.aggregate({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    },
    _sum: {
      subtotalAmount: true,
      taxAmount: true,
      totalAmount: true
    },
    _count: {
      id: true
    }
  });

  const subtotalAmount = Number(taxData._sum.subtotalAmount || 0);
  const taxAmount = Number(taxData._sum.taxAmount || 0);
  const totalAmount = Number(taxData._sum.totalAmount || 0);
  
  return {
    totalSubtotal: subtotalAmount,
    totalTax: taxAmount,
    totalRevenue: totalAmount,
    averageTaxRate: subtotalAmount > 0 ? (taxAmount / subtotalAmount) * 100 : 0,
    taxableOrders: taxData._count.id
  };
}

async function getRefundAnalytics(restaurantId: string, startDate: Date, endDate: Date) {
  const refundData = await prisma.payment.groupBy({
    by: ['status'],
    where: {
      order: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      status: {
        in: ['refunded', 'partially_refunded']
      }
    },
    _sum: {
      amount: true
    },
    _count: {
      id: true
    }
  });

  const totalRefunds = refundData.reduce((sum, item) => sum + Number(item._sum.amount || 0), 0);
  const refundCount = refundData.reduce((sum, item) => sum + item._count.id, 0);

  // Get total revenue for refund rate calculation
  const totalRevenue = await prisma.order.aggregate({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    },
    _sum: {
      totalAmount: true
    }
  });

  const revenue = Number(totalRevenue._sum.totalAmount || 0);
  const refundRate = revenue > 0 ? (totalRefunds / revenue) * 100 : 0;

  return {
    totalRefunds,
    refundCount,
    refundRate: Math.round(refundRate * 100) / 100,
    averageRefundAmount: refundCount > 0 ? totalRefunds / refundCount : 0
  };
}