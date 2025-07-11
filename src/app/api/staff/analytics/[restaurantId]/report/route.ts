import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';
import { withQueryPerformance } from '@/lib/performance';

// Simple in-memory cache for report data (5 minutes TTL)
const reportCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(restaurantId: string, reportType: string, startDate: Date, endDate: Date): string {
  return `${restaurantId}-${reportType}-${startDate.toISOString()}-${endDate.toISOString()}`;
}

function getCachedReport(key: string): any | null {
  const cached = reportCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  if (cached) {
    reportCache.delete(key);
  }
  return null;
}

function setCachedReport(key: string, data: any): void {
  reportCache.set(key, { data, timestamp: Date.now() });
}

export async function POST(
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

    const {
      reportType,
      dateRange,
      format,
      filters
    } = await request.json();

    if (!reportType || !dateRange) {
      return NextResponse.json(
        { error: 'Report type and date range are required' },
        { status: 400 }
      );
    }

    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);

    // Check cache first
    const cacheKey = getCacheKey(restaurantId, reportType, startDate, endDate);
    let reportData = getCachedReport(cacheKey);

    if (!reportData) {
      // Generate report and cache it
      switch (reportType) {
      case 'sales':
        reportData = await generateSalesReport(restaurantId, startDate, endDate, filters);
        break;
      case 'menu':
        reportData = await generateMenuReport(restaurantId, startDate, endDate, filters);
        break;
      case 'financial':
        reportData = await generateFinancialReport(restaurantId, startDate, endDate, filters);
        break;
      case 'operational':
        reportData = await generateOperationalReport(restaurantId, startDate, endDate, filters);
        break;
      case 'customer':
        reportData = await generateCustomerReport(restaurantId, startDate, endDate, filters);
        break;
      case 'comprehensive':
        reportData = await generateComprehensiveReport(restaurantId, startDate, endDate, filters);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid report type' },
          { status: 400 }
        );
      }
      
      // Cache the generated report
      setCachedReport(cacheKey, reportData);
    }

    // Store report generation record (commented out for now as table may not exist)
    // await prisma.reportGeneration.create({
    //   data: {
    //     restaurantId,
    //     reportType,
    //     dateRange: `${startDate.toISOString()} - ${endDate.toISOString()}`,
    //     filters: filters || {},
    //     generatedBy: authResult.staff.id,
    //     format: format || 'json'
    //   }
    // });

    if (format === 'csv') {
      const csvData = convertToCSV(reportData, reportType);
      return new Response(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${reportType}-report-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    if (format === 'pdf') {
      // For now, we'll return an HTML response that can be printed as PDF
      // In a real implementation, you'd use a proper PDF library like puppeteer
      const htmlContent = generateHTMLReport(reportData, reportType, { start: startDate, end: endDate });
      return new Response(htmlContent, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `inline; filename="${reportType}-report-${new Date().toISOString().split('T')[0]}.html"`
        }
      });
    }

    return NextResponse.json({
      success: true,
      report: {
        type: reportType,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        generatedAt: new Date().toISOString(),
        generatedBy: {
          id: authResult.staff.id,
          name: `${authResult.staff.firstName} ${authResult.staff.lastName}`
        },
        data: reportData
      }
    });

  } catch (error) {
    console.error('Failed to generate report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}

async function generateSalesReport(restaurantId: string, startDate: Date, endDate: Date, _filters?: Record<string, unknown>) {
  // Optimized sales summary with selective fields
  const salesSummary = await withQueryPerformance('sales_summary', () =>
    prisma.order.aggregate({
      where: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'served'
      },
      _sum: {
        totalAmount: true,
        subtotal: true,
        taxAmount: true
      },
      _count: {
        id: true
      },
      _avg: {
        totalAmount: true
      }
    })
  );

  // Daily sales breakdown
  const dailySales = await getDailySalesBreakdown(restaurantId, startDate, endDate);

  // Sales by category
  const categorySales = await getCategorySales(restaurantId, startDate, endDate);

  // Top selling items
  const topItems = await getTopSellingItems(restaurantId, startDate, endDate, 10);

  return {
    summary: {
      totalRevenue: Number(salesSummary._sum.totalAmount || 0),
      totalOrders: salesSummary._count.id,
      averageOrderValue: Number(salesSummary._avg.totalAmount || 0),
      totalTax: Number(salesSummary._sum.taxAmount || 0)
    },
    dailyBreakdown: dailySales,
    categoryBreakdown: categorySales,
    topSellingItems: topItems
  };
}

async function generateMenuReport(restaurantId: string, startDate: Date, endDate: Date, _filters?: Record<string, unknown>) {
  // Menu performance summary
  const menuItems = await prisma.menuItem.findMany({
    where: {
      category: {
        restaurantId
      }
    },
    include: {
      category: true,
      orderItems: {
        where: {
          order: {
            createdAt: {
              gte: startDate,
              lte: endDate
            },
            status: 'served'
          }
        }
      }
    }
  });

  const menuPerformance = menuItems.map(item => {
    const orderItems = item.orderItems;
    const totalQuantity = orderItems.reduce((sum, oi) => sum + oi.quantity, 0);
    const totalRevenue = orderItems.reduce((sum, oi) => sum + Number(oi.totalPrice), 0);

    return {
      id: item.id,
      name: item.name,
      category: item.category.name,
      price: item.price,
      quantitySold: totalQuantity,
      revenue: totalRevenue,
      timesOrdered: orderItems.length,
      isAvailable: item.isAvailable,
      performance: calculateItemPerformance(totalQuantity, totalRevenue, item.price)
    };
  });

  // Items not ordered
  const itemsNotOrdered = menuPerformance.filter(item => item.quantitySold === 0);

  // Top and bottom performers
  const topPerformers = menuPerformance
    .filter(item => item.quantitySold > 0)
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 10);

  const bottomPerformers = menuPerformance
    .filter(item => item.quantitySold > 0)
    .sort((a, b) => a.quantitySold - b.quantitySold)
    .slice(0, 10);

  return {
    summary: {
      totalMenuItems: menuItems.length,
      activeItems: menuItems.filter(item => item.isAvailable).length,
      itemsOrdered: menuPerformance.filter(item => item.quantitySold > 0).length,
      itemsNotOrdered: itemsNotOrdered.length
    },
    itemsNotOrdered,
    topPerformers,
    bottomPerformers,
    fullMenuPerformance: menuPerformance
  };
}

async function generateFinancialReport(restaurantId: string, startDate: Date, endDate: Date, _filters?: Record<string, unknown>) {
  // Revenue analytics
  const revenueData = await prisma.order.aggregate({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served'
    },
    _sum: {
      totalAmount: true,
      subtotal: true,
      taxAmount: true
    }
  });

  // Payment method breakdown
  const paymentMethods = await prisma.payment.groupBy({
    by: ['paymentMethod'],
    where: {
      order: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
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

  // Refunds
  const refundData = await prisma.payment.aggregate({
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

  return {
    revenue: {
      gross: Number(revenueData._sum.totalAmount || 0),
      net: Number(revenueData._sum.subtotal || 0),
      tax: Number(revenueData._sum.taxAmount || 0)
    },
    paymentMethods: paymentMethods.map(pm => ({
      method: pm.paymentMethod,
      amount: Number(pm._sum.amount || 0),
      transactions: pm._count.id
    })),
    refunds: {
      totalAmount: Number(refundData._sum.amount || 0),
      totalCount: refundData._count.id
    }
  };
}

async function generateOperationalReport(restaurantId: string, startDate: Date, endDate: Date, _filters?: Record<string, unknown>) {
  // Order processing times
  const processingTimes = await getOrderProcessingTimes(restaurantId, startDate, endDate);

  // Table utilization
  const tableUtilization = await getTableUtilization(restaurantId, startDate, endDate);

  // Peak hours analysis
  const peakHours = await getPeakHoursAnalysis(restaurantId, startDate, endDate);

  // Staff performance (if available)
  const staffPerformance = await getStaffPerformance(restaurantId, startDate, endDate);

  return {
    orderProcessing: processingTimes,
    tableUtilization,
    peakHours,
    staffPerformance
  };
}

async function generateCustomerReport(restaurantId: string, startDate: Date, endDate: Date, _filters?: Record<string, unknown>) {
  // Customer sessions
  const customerSessions = await prisma.customerSession.findMany({
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

  const totalSessions = customerSessions.length;
  const sessionsWithOrders = customerSessions.filter(s => s.orders.length > 0);
  const conversionRate = totalSessions > 0 ? (sessionsWithOrders.length / totalSessions) * 100 : 0;

  // Average session value
  const totalSessionValue = sessionsWithOrders.reduce((sum, session) => {
    return sum + session.orders.reduce((orderSum, order) => orderSum + Number(order.totalAmount), 0);
  }, 0);

  const averageSessionValue = sessionsWithOrders.length > 0 ? totalSessionValue / sessionsWithOrders.length : 0;

  return {
    summary: {
      totalSessions,
      sessionsWithOrders: sessionsWithOrders.length,
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageSessionValue: Math.round(averageSessionValue * 100) / 100
    },
    sessionDetails: customerSessions.map(session => ({
      sessionId: session.id,
      tableId: session.tableId,
      duration: session.endedAt ? 
        Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000) : null,
      orders: session.orders.length,
      totalSpent: session.orders.reduce((sum, order) => sum + Number(order.totalAmount), 0)
    }))
  };
}

async function generateComprehensiveReport(restaurantId: string, startDate: Date, endDate: Date, filters?: Record<string, unknown>) {
  const [salesReport, menuReport, financialReport, operationalReport, customerReport] = await Promise.all([
    generateSalesReport(restaurantId, startDate, endDate, filters),
    generateMenuReport(restaurantId, startDate, endDate, filters),
    generateFinancialReport(restaurantId, startDate, endDate, filters),
    generateOperationalReport(restaurantId, startDate, endDate, filters),
    generateCustomerReport(restaurantId, startDate, endDate, filters)
  ]);

  return {
    executive_summary: {
      period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      total_revenue: salesReport.summary.totalRevenue,
      total_orders: salesReport.summary.totalOrders,
      customer_conversion_rate: customerReport.summary.conversionRate,
      top_performing_item: salesReport.topSellingItems[0]?.name || 'N/A'
    },
    sales: salesReport,
    menu: menuReport,
    financial: financialReport,
    operational: operationalReport,
    customer: customerReport
  };
}

// Helper functions
async function getDailySalesBreakdown(restaurantId: string, startDate: Date, endDate: Date) {
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
    }
  });

  const dailyData = new Map();
  orders.forEach(order => {
    const dateKey = order.createdAt.toISOString().split('T')[0];
    const existing = dailyData.get(dateKey) || { date: dateKey, revenue: 0, orders: 0 };
    existing.revenue += Number(order.totalAmount);
    existing.orders += 1;
    dailyData.set(dateKey, existing);
  });

  return Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getCategorySales(restaurantId: string, startDate: Date, endDate: Date) {
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
      totalPrice: true,
      quantity: true
    }
  });

  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: categoryData.map(item => item.menuItemId)
      }
    },
    include: {
      category: true
    }
  });

  const categoryMap = new Map();
  categoryData.forEach(item => {
    const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
    if (menuItem?.category) {
      const categoryId = menuItem.category.id;
      const existing = categoryMap.get(categoryId) || {
        categoryId,
        name: menuItem.category.name,
        revenue: 0,
        quantity: 0
      };
      existing.revenue += Number(item._sum.totalPrice || 0);
      existing.quantity += item._sum.quantity || 0;
      categoryMap.set(categoryId, existing);
    }
  });

  return Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue);
}

async function getTopSellingItems(restaurantId: string, startDate: Date, endDate: Date, limit: number) {
  const topItems = await prisma.orderItem.groupBy({
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
      quantity: true,
      totalPrice: true
    },
    orderBy: {
      _sum: {
        quantity: 'desc'
      }
    },
    take: limit
  });

  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: topItems.map(item => item.menuItemId)
      }
    }
  });

  return topItems.map(item => {
    const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
    return {
      name: menuItem?.name || 'Unknown',
      quantitySold: item._sum.quantity || 0,
      revenue: Number(item._sum.totalPrice || 0)
    };
  });
}

function calculateItemPerformance(quantity: number): string {
  if (quantity === 0) return 'No sales';
  if (quantity >= 50) return 'Excellent';
  if (quantity >= 20) return 'Good';
  if (quantity >= 10) return 'Average';
  return 'Poor';
}

async function getOrderProcessingTimes(restaurantId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'served',
      confirmedAt: { not: null },
      servedAt: { not: null }
    },
    select: {
      confirmedAt: true,
      servedAt: true
    }
  });

  const processingTimes = orders.map(order => {
    if (order.confirmedAt && order.servedAt) {
      return Math.round((order.servedAt.getTime() - order.confirmedAt.getTime()) / 60000);
    }
    return null;
  }).filter(Boolean);

  const averageTime = processingTimes.length > 0 
    ? processingTimes.reduce((sum, time) => sum + time!, 0) / processingTimes.length 
    : 0;

  return {
    averageProcessingTime: Math.round(averageTime),
    totalOrders: processingTimes.length,
    processingTimeDistribution: getTimeDistribution(processingTimes)
  };
}

function getTimeDistribution(times: (number | null)[]): Array<{range: string; count: number; percentage: number}> {
  const ranges = [
    { min: 0, max: 15, label: '0-15 min' },
    { min: 15, max: 30, label: '15-30 min' },
    { min: 30, max: 45, label: '30-45 min' },
    { min: 45, max: Infinity, label: '45+ min' }
  ];

  return ranges.map(range => {
    const count = times.filter(time => 
      time !== null && time >= range.min && time < range.max
    ).length;

    return {
      range: range.label,
      count,
      percentage: times.length > 0 ? (count / times.length) * 100 : 0
    };
  });
}

async function getTableUtilization(_restaurantId: string, _startDate: Date, _endDate: Date) {
  // This would require more complex logic to track table occupancy
  // For now, return a placeholder structure
  return {
    averageUtilization: 75,
    peakUtilization: 95,
    lowUtilization: 45
  };
}

async function getPeakHoursAnalysis(restaurantId: string, startDate: Date, endDate: Date) {
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
    const hour = order.createdAt.getHours();
    hourCounts[hour]++;
  });

  return hourCounts.map((count, hour) => ({
    hour,
    orders: count,
    period: `${hour.toString().padStart(2, '0')}:00`
  }));
}

async function getStaffPerformance(_restaurantId: string, _startDate: Date, _endDate: Date) {
  // This would track staff-specific metrics
  // For now, return a placeholder
  return {
    message: 'Staff performance tracking would be implemented here'
  };
}

function convertToCSV(data: Record<string, unknown>, reportType: string): string {
  let csvContent = '';
  
  if (reportType === 'comprehensive') {
    // Special handling for comprehensive reports
    csvContent = `Report Type,Comprehensive Report\n`;
    csvContent += `Generated,${new Date().toLocaleDateString()}\n\n`;
    
    // Executive Summary
    if (data.executive_summary) {
      csvContent += `Executive Summary\n`;
      csvContent += `Period,${data.executive_summary.period}\n`;
      csvContent += `Total Revenue,$${data.executive_summary.total_revenue}\n`;
      csvContent += `Total Orders,${data.executive_summary.total_orders}\n`;
      csvContent += `Conversion Rate,${data.executive_summary.customer_conversion_rate}%\n`;
      csvContent += `Top Item,${data.executive_summary.top_performing_item}\n\n`;
    }
    
    // Sales Summary
    if (data.sales?.summary) {
      csvContent += `Sales Summary\n`;
      csvContent += `Total Revenue,$${data.sales.summary.totalRevenue}\n`;
      csvContent += `Total Orders,${data.sales.summary.totalOrders}\n`;
      csvContent += `Average Order Value,$${data.sales.summary.averageOrderValue}\n`;
      csvContent += `Total Tax,$${data.sales.summary.totalTax}\n\n`;
    }
    
    // Top Selling Items
    if (data.sales?.topSellingItems) {
      csvContent += `Top Selling Items\n`;
      csvContent += `Rank,Item Name,Quantity Sold,Revenue\n`;
      data.sales.topSellingItems.forEach((item: {name: string; quantitySold: number; revenue: number}, index: number) => {
        csvContent += `${index + 1},${item.name},${item.quantitySold},$${item.revenue}\n`;
      });
      csvContent += `\n`;
    }
    
    // Menu Performance
    if (data.menu?.summary) {
      csvContent += `Menu Performance\n`;
      csvContent += `Total Items,${data.menu.summary.totalMenuItems}\n`;
      csvContent += `Active Items,${data.menu.summary.activeItems}\n`;
      csvContent += `Items Ordered,${data.menu.summary.itemsOrdered}\n`;
      csvContent += `Items Not Ordered,${data.menu.summary.itemsNotOrdered}\n\n`;
    }
    
    // Financial Summary
    if (data.financial?.revenue) {
      csvContent += `Financial Summary\n`;
      csvContent += `Gross Revenue,$${data.financial.revenue.gross}\n`;
      csvContent += `Net Revenue,$${data.financial.revenue.net}\n`;
      csvContent += `Tax Collected,$${data.financial.revenue.tax}\n\n`;
    }
    
    // Customer Analytics
    if (data.customer?.summary) {
      csvContent += `Customer Analytics\n`;
      csvContent += `Total Sessions,${data.customer.summary.totalSessions}\n`;
      csvContent += `Sessions with Orders,${data.customer.summary.sessionsWithOrders}\n`;
      csvContent += `Conversion Rate,${data.customer.summary.conversionRate}%\n`;
      csvContent += `Average Session Value,$${data.customer.summary.averageSessionValue}\n`;
    }
    
    return csvContent;
  } else if (reportType === 'sales' && data.summary) {
    // Sales report CSV
    csvContent = `Sales Report\n`;
    csvContent += `Generated,${new Date().toLocaleDateString()}\n\n`;
    csvContent += `Summary\n`;
    csvContent += `Total Revenue,$${data.summary.totalRevenue}\n`;
    csvContent += `Total Orders,${data.summary.totalOrders}\n`;
    csvContent += `Average Order Value,$${data.summary.averageOrderValue}\n`;
    csvContent += `Total Tax,$${data.summary.totalTax}\n\n`;
    
    if (data.topSellingItems) {
      csvContent += `Top Selling Items\n`;
      csvContent += `Rank,Item Name,Quantity Sold,Revenue\n`;
      data.topSellingItems.forEach((item: {name: string; quantitySold: number; revenue: number}, index: number) => {
        csvContent += `${index + 1},${item.name},${item.quantitySold},$${item.revenue}\n`;
      });
    }
    
    return csvContent;
  } else {
    // Generic CSV conversion for other report types
    const headers = Object.keys(data).join(',');
    const rows = [headers];
    
    rows.push(Object.values(data).map(value => 
      typeof value === 'object' ? JSON.stringify(value) : String(value)
    ).join(','));

    return rows.join('\n');
  }
}

function generateHTMLReport(data: Record<string, unknown>, reportType: string, dateRange: { start: Date, end: Date }): string {
  const title = reportType.charAt(0).toUpperCase() + reportType.slice(1) + ' Report';
  const dateStr = `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`;
  
  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .title { font-size: 28px; font-weight: bold; margin-bottom: 10px; color: #2563eb; }
        .date { font-size: 14px; color: #666; margin-bottom: 5px; }
        .section { margin-bottom: 30px; page-break-inside: avoid; }
        .section h3 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-bottom: 15px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; min-width: 120px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 5px; }
        .metric-label { font-size: 12px; color: #666; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; }
        th { background-color: #f8f9fa; font-weight: bold; color: #333; }
        tbody tr:nth-child(even) { background-color: #f9f9f9; }
        .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer; }
        .print-btn:hover { background: #1d4ed8; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .highlight { background: #fef3c7; padding: 2px 4px; border-radius: 3px; }
      </style>
      <script>
        function printReport() {
          window.print();
        }
      </script>
    </head>
    <body>
      <button class="print-btn no-print" onclick="printReport()">🖨️ Print PDF</button>
      
      <div class="header">
        <div class="title">${title}</div>
        <div class="date">Generated on ${new Date().toLocaleDateString()}</div>
        <div class="date">Period: ${dateStr}</div>
      </div>
  `;

  // Add content based on report type
  if (reportType === 'sales' && data.summary) {
    htmlContent += `
      <div class="section">
        <h3>📊 Sales Summary</h3>
        <div class="summary-grid">
          <div class="metric">
            <div class="metric-value">$${data.summary.totalRevenue.toFixed(2)}</div>
            <div class="metric-label">Total Revenue</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.summary.totalOrders}</div>
            <div class="metric-label">Total Orders</div>
          </div>
          <div class="metric">
            <div class="metric-value">$${data.summary.averageOrderValue.toFixed(2)}</div>
            <div class="metric-label">Average Order Value</div>
          </div>
          <div class="metric">
            <div class="metric-value">$${data.summary.totalTax.toFixed(2)}</div>
            <div class="metric-label">Total Tax</div>
          </div>
        </div>
      </div>
    `;

    if (data.topSellingItems && data.topSellingItems.length > 0) {
      htmlContent += `
        <div class="section">
          <h3>🌟 Top Selling Items</h3>
          <table>
            <thead>
              <tr><th>Rank</th><th>Item Name</th><th>Quantity Sold</th><th>Revenue</th></tr>
            </thead>
            <tbody>
      `;
      data.topSellingItems.slice(0, 10).forEach((item: {name: string; quantitySold: number; revenue: number}, index: number) => {
        htmlContent += `<tr><td>${index + 1}</td><td>${item.name}</td><td>${item.quantitySold}</td><td>$${item.revenue.toFixed(2)}</td></tr>`;
      });
      htmlContent += `</tbody></table></div>`;
    }

    if (data.dailyBreakdown && data.dailyBreakdown.length > 0) {
      htmlContent += `
        <div class="section">
          <h3>📅 Daily Breakdown</h3>
          <table>
            <thead>
              <tr><th>Date</th><th>Revenue</th><th>Orders</th></tr>
            </thead>
            <tbody>
      `;
      data.dailyBreakdown.forEach((day: {date: string; revenue: number; orders: number}) => {
        htmlContent += `<tr><td>${new Date(day.date).toLocaleDateString()}</td><td>$${day.revenue.toFixed(2)}</td><td>${day.orders}</td></tr>`;
      });
      htmlContent += `</tbody></table></div>`;
    }
  } else if (reportType === 'menu' && data.summary) {
    htmlContent += `
      <div class="section">
        <h3>🍽️ Menu Performance Summary</h3>
        <div class="summary-grid">
          <div class="metric">
            <div class="metric-value">${data.summary.totalMenuItems}</div>
            <div class="metric-label">Total Menu Items</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.summary.activeItems}</div>
            <div class="metric-label">Active Items</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.summary.itemsOrdered}</div>
            <div class="metric-label">Items Ordered</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.summary.itemsNotOrdered}</div>
            <div class="metric-label">Items Not Ordered</div>
          </div>
        </div>
      </div>
    `;

    if (data.topPerformers && data.topPerformers.length > 0) {
      htmlContent += `
        <div class="section">
          <h3>🏆 Top Performing Items</h3>
          <table>
            <thead>
              <tr><th>Rank</th><th>Item Name</th><th>Category</th><th>Price</th><th>Quantity Sold</th><th>Revenue</th></tr>
            </thead>
            <tbody>
      `;
      data.topPerformers.slice(0, 10).forEach((item: {name: string; category: string; price: number; quantitySold: number; revenue: number}, index: number) => {
        htmlContent += `<tr><td>${index + 1}</td><td>${item.name}</td><td>${item.category}</td><td>$${item.price.toFixed(2)}</td><td>${item.quantitySold}</td><td>$${item.revenue.toFixed(2)}</td></tr>`;
      });
      htmlContent += `</tbody></table></div>`;
    }
  } else if (reportType === 'financial' && data.revenue) {
    htmlContent += `
      <div class="section">
        <h3>💰 Financial Summary</h3>
        <div class="summary-grid">
          <div class="metric">
            <div class="metric-value">$${data.revenue.gross.toFixed(2)}</div>
            <div class="metric-label">Gross Revenue</div>
          </div>
          <div class="metric">
            <div class="metric-value">$${data.revenue.net.toFixed(2)}</div>
            <div class="metric-label">Net Revenue</div>
          </div>
          <div class="metric">
            <div class="metric-value">$${data.revenue.tax.toFixed(2)}</div>
            <div class="metric-label">Tax Collected</div>
          </div>
        </div>
      </div>
    `;

    if (data.paymentMethods && data.paymentMethods.length > 0) {
      htmlContent += `
        <div class="section">
          <h3>💳 Payment Methods</h3>
          <table>
            <thead>
              <tr><th>Payment Method</th><th>Amount</th><th>Transactions</th><th>Percentage</th></tr>
            </thead>
            <tbody>
      `;
      data.paymentMethods.forEach((method: {method: string; amount: number; transactions: number}) => {
        const percentage = ((method.amount / data.revenue.gross) * 100).toFixed(1);
        htmlContent += `<tr><td>${method.method.charAt(0).toUpperCase() + method.method.slice(1)}</td><td>$${method.amount.toFixed(2)}</td><td>${method.transactions}</td><td>${percentage}%</td></tr>`;
      });
      htmlContent += `</tbody></table></div>`;
    }
  } else if (reportType === 'customer' && data.summary) {
    htmlContent += `
      <div class="section">
        <h3>👥 Customer Summary</h3>
        <div class="summary-grid">
          <div class="metric">
            <div class="metric-value">${data.summary.totalSessions}</div>
            <div class="metric-label">Total Sessions</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.summary.sessionsWithOrders}</div>
            <div class="metric-label">Sessions with Orders</div>
          </div>
          <div class="metric">
            <div class="metric-value">${data.summary.conversionRate}%</div>
            <div class="metric-label">Conversion Rate</div>
          </div>
          <div class="metric">
            <div class="metric-value">$${data.summary.averageSessionValue.toFixed(2)}</div>
            <div class="metric-label">Average Session Value</div>
          </div>
        </div>
      </div>
    `;
  } else if (reportType === 'comprehensive') {
    // Comprehensive report - combine all sections
    if (data.executive_summary) {
      htmlContent += `
        <div class="section">
          <h3>🏢 Executive Summary</h3>
          <div class="summary-grid">
            <div class="metric">
              <div class="metric-value">$${data.executive_summary.total_revenue.toFixed(2)}</div>
              <div class="metric-label">Total Revenue</div>
            </div>
            <div class="metric">
              <div class="metric-value">${data.executive_summary.total_orders}</div>
              <div class="metric-label">Total Orders</div>
            </div>
            <div class="metric">
              <div class="metric-value">${data.executive_summary.customer_conversion_rate}%</div>
              <div class="metric-label">Conversion Rate</div>
            </div>
            <div class="metric">
              <div class="metric-value">${data.executive_summary.top_performing_item}</div>
              <div class="metric-label">Top Item</div>
            </div>
          </div>
        </div>
      `;
    }
    
    if (data.sales?.summary) {
      htmlContent += `
        <div class="section">
          <h3>📊 Sales Performance</h3>
          <div class="summary-grid">
            <div class="metric">
              <div class="metric-value">$${data.sales.summary.totalRevenue.toFixed(2)}</div>
              <div class="metric-label">Total Revenue</div>
            </div>
            <div class="metric">
              <div class="metric-value">${data.sales.summary.totalOrders}</div>
              <div class="metric-label">Total Orders</div>
            </div>
            <div class="metric">
              <div class="metric-value">$${data.sales.summary.averageOrderValue.toFixed(2)}</div>
              <div class="metric-label">Avg Order Value</div>
            </div>
            <div class="metric">
              <div class="metric-value">$${data.sales.summary.totalTax.toFixed(2)}</div>
              <div class="metric-label">Total Tax</div>
            </div>
          </div>
        </div>
      `;
    }
    
    if (data.menu?.summary) {
      htmlContent += `
        <div class="section">
          <h3>🍽️ Menu Performance</h3>
          <div class="summary-grid">
            <div class="metric">
              <div class="metric-value">${data.menu.summary.totalMenuItems}</div>
              <div class="metric-label">Total Items</div>
            </div>
            <div class="metric">
              <div class="metric-value">${data.menu.summary.activeItems}</div>
              <div class="metric-label">Active Items</div>
            </div>
            <div class="metric">
              <div class="metric-value">${data.menu.summary.itemsOrdered}</div>
              <div class="metric-label">Items Ordered</div>
            </div>
            <div class="metric">
              <div class="metric-value">${data.menu.summary.itemsNotOrdered}</div>
              <div class="metric-label">Items Not Ordered</div>
            </div>
          </div>
        </div>
      `;
    }
    
    if (data.financial?.revenue) {
      htmlContent += `
        <div class="section">
          <h3>💰 Financial Summary</h3>
          <div class="summary-grid">
            <div class="metric">
              <div class="metric-value">$${data.financial.revenue.gross.toFixed(2)}</div>
              <div class="metric-label">Gross Revenue</div>
            </div>
            <div class="metric">
              <div class="metric-value">$${data.financial.revenue.net.toFixed(2)}</div>
              <div class="metric-label">Net Revenue</div>
            </div>
            <div class="metric">
              <div class="metric-value">$${data.financial.revenue.tax.toFixed(2)}</div>
              <div class="metric-label">Tax Collected</div>
            </div>
          </div>
        </div>
      `;
    }
    
    if (data.customer?.summary) {
      htmlContent += `
        <div class="section">
          <h3>👥 Customer Analytics</h3>
          <div class="summary-grid">
            <div class="metric">
              <div class="metric-value">${data.customer.summary.totalSessions}</div>
              <div class="metric-label">Total Sessions</div>
            </div>
            <div class="metric">
              <div class="metric-value">${data.customer.summary.conversionRate}%</div>
              <div class="metric-label">Conversion Rate</div>
            </div>
            <div class="metric">
              <div class="metric-value">$${data.customer.summary.averageSessionValue.toFixed(2)}</div>
              <div class="metric-label">Avg Session Value</div>
            </div>
          </div>
        </div>
      `;
    }
  } else {
    // Generic report content
    htmlContent += `
      <div class="section">
        <h3>📋 Report Data</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;">
          <p><strong>Report Type:</strong> <span class="highlight">${reportType.charAt(0).toUpperCase() + reportType.slice(1)}</span></p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Period:</strong> ${dateStr}</p>
          <hr style="margin: 20px 0; border: 1px solid #ddd;">
          <pre style="background: #fff; padding: 15px; border-radius: 5px; font-size: 12px; overflow-x: auto; border: 1px solid #ddd;">
${JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    `;
  }

  htmlContent += `
      <div class="section" style="margin-top: 40px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px;">
        <p>Generated by QR Restaurant System | ${new Date().toLocaleString()}</p>
        <p class="no-print">💡 Use Ctrl+P (Cmd+P on Mac) to save as PDF</p>
      </div>
    </body>
    </html>
  `;

  return htmlContent;
}