import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { cacheManager, cacheMonitor } from '../../../../../lib/cache';
import { Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

interface ProfitLossReport {
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  revenue: {
    grossSales: number;
    discounts: number;
    refunds: number;
    netSales: number;
  };
  cogs: {
    breakdown: Array<{
      categoryName: string;
      amount: number;
      percentage: number;
    }>;
    totalCOGS: number;
    cogsPercentage: number;
  };
  grossProfit: {
    amount: number;
    margin: number;
  };
  operatingExpenses: {
    breakdown: Array<{
      categoryName: string;
      amount: number;
      percentage: number;
    }>;
    totalOperatingExpenses: number;
    opexPercentage: number;
  };
  netProfit: {
    amount: number;
    margin: number;
  };
  keyMetrics: {
    foodCostPercentage: number;
    laborCostPercentage: number;
    primeCost: number;
    primeCostPercentage: number;
    breakEvenRevenue: number;
  };
}

// ============================================================================
// GET Handler - Generate P&L Report
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Authentication
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

    // Parse query parameters
    const url = new URL(request.url);
    const restaurantId = url.searchParams.get('restaurantId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant ID is required' },
        { status: 400 }
      );
    }

    // Set default date range (current month) if not provided
    const now = new Date();
    const defaultStartDate = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEndDate = endDate ? new Date(endDate) : now;

    // Validate date range
    if (defaultEndDate < defaultStartDate) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // Authorization - Check user has access to this restaurant
    const userType =
      authResult.user.currentRole?.userType || authResult.user.userType;

    if (userType === 'restaurant_owner') {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: {
          id: restaurantId,
          ownerId: authResult.user.id,
        },
        select: { id: true },
      });

      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'Access denied to this restaurant' },
          { status: 403 }
        );
      }
    } else if (userType === 'staff') {
      const staffRestaurantId = authResult.user.currentRole?.restaurantId;
      if (staffRestaurantId !== restaurantId) {
        return NextResponse.json(
          { error: 'Access denied to this restaurant' },
          { status: 403 }
        );
      }

      // Check if staff has permission
      const hasPermission = await AuthServiceV2.checkPermission(
        authResult.user.id,
        'reports.view'
      );

      if (!hasPermission) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 403 });
    }

    // Generate P&L report with smart caching
    const report = await cacheManager.get(
      'profit-loss',
      {
        restaurantId,
        startDate: defaultStartDate.toISOString(),
        endDate: defaultEndDate.toISOString(),
      },
      async () => {
        cacheMonitor.recordMiss();

        // ================================================================
        // 1. Calculate Revenue Section
        // ================================================================

        // Get gross sales from completed orders
        const revenueData = await prisma.order.aggregate({
          where: {
            restaurantId,
            createdAt: {
              gte: defaultStartDate,
              lte: defaultEndDate,
            },
            status: 'SERVED',
          },
          _sum: {
            totalAmount: true,
            discountAmount: true,
          },
        });

        const grossSales = Number(revenueData._sum.totalAmount || 0);
        const discounts = Number(revenueData._sum.discountAmount || 0);

        // Get refunds from payments
        const refundsData = await prisma.payment.aggregate({
          where: {
            order: {
              restaurantId,
              createdAt: {
                gte: defaultStartDate,
                lte: defaultEndDate,
              },
            },
            status: 'REFUNDED',
          },
          _sum: {
            amount: true,
          },
        });

        const refunds = Number(refundsData._sum.amount || 0);
        const netSales = grossSales - discounts - refunds;

        // ================================================================
        // 2. Calculate COGS Section (using materialized view)
        // ================================================================

        // Query materialized view for COGS
        const cogsData = await prisma.$queryRaw<
          Array<{
            category_name: string;
            total_amount: Prisma.Decimal;
          }>
        >`
          SELECT 
            category_name,
            SUM(total_amount) as total_amount
          FROM expense_daily_summary
          WHERE "restaurantId" = ${restaurantId}
            AND expense_date >= ${defaultStartDate}
            AND expense_date <= ${defaultEndDate}
            AND "categoryType" = 'COGS'
          GROUP BY category_name
          ORDER BY total_amount DESC
        `;

        const cogsBreakdown = cogsData.map((item) => ({
          categoryName: item.category_name,
          amount: Number(item.total_amount),
          percentage:
            netSales > 0 ? (Number(item.total_amount) / netSales) * 100 : 0,
        }));

        const totalCOGS = cogsBreakdown.reduce(
          (sum, item) => sum + item.amount,
          0
        );
        const cogsPercentage = netSales > 0 ? (totalCOGS / netSales) * 100 : 0;

        // ================================================================
        // 3. Calculate Gross Profit
        // ================================================================

        const grossProfit = netSales - totalCOGS;
        const grossProfitMargin =
          netSales > 0 ? (grossProfit / netSales) * 100 : 0;

        // ================================================================
        // 4. Calculate Operating Expenses (using materialized view)
        // ================================================================

        const opexData = await prisma.$queryRaw<
          Array<{
            category_name: string;
            total_amount: Prisma.Decimal;
          }>
        >`
          SELECT 
            category_name,
            SUM(total_amount) as total_amount
          FROM expense_daily_summary
          WHERE "restaurantId" = ${restaurantId}
            AND expense_date >= ${defaultStartDate}
            AND expense_date <= ${defaultEndDate}
            AND "categoryType" = 'OPERATING'
          GROUP BY category_name
          ORDER BY total_amount DESC
        `;

        const opexBreakdown = opexData.map((item) => ({
          categoryName: item.category_name,
          amount: Number(item.total_amount),
          percentage:
            netSales > 0 ? (Number(item.total_amount) / netSales) * 100 : 0,
        }));

        const totalOperatingExpenses = opexBreakdown.reduce(
          (sum, item) => sum + item.amount,
          0
        );
        const opexPercentage =
          netSales > 0 ? (totalOperatingExpenses / netSales) * 100 : 0;

        // ================================================================
        // 5. Calculate Net Profit
        // ================================================================

        const netProfit = grossProfit - totalOperatingExpenses;
        const netProfitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

        // ================================================================
        // 6. Calculate Key Metrics
        // ================================================================

        // Food cost (from COGS breakdown)
        const foodCost =
          cogsBreakdown.find((item) =>
            item.categoryName.toLowerCase().includes('food')
          )?.amount || 0;
        const foodCostPercentage =
          netSales > 0 ? (foodCost / netSales) * 100 : 0;

        // Labor cost (from operating expenses)
        const laborCost =
          opexBreakdown.find(
            (item) =>
              item.categoryName.toLowerCase().includes('salaries') ||
              item.categoryName.toLowerCase().includes('wages')
          )?.amount || 0;
        const laborCostPercentage =
          netSales > 0 ? (laborCost / netSales) * 100 : 0;

        // Prime cost (COGS + Labor)
        const primeCost = totalCOGS + laborCost;
        const primeCostPercentage =
          netSales > 0 ? (primeCost / netSales) * 100 : 0;

        // Break-even revenue (total expenses / (1 - target profit margin))
        // Assuming 10% target profit margin
        const totalExpenses = totalCOGS + totalOperatingExpenses;
        const breakEvenRevenue = totalExpenses / 0.9; // 10% profit margin

        // ================================================================
        // 7. Build Report Object
        // ================================================================

        const days =
          Math.ceil(
            (defaultEndDate.getTime() - defaultStartDate.getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1;

        const report: ProfitLossReport = {
          period: {
            startDate: defaultStartDate.toISOString(),
            endDate: defaultEndDate.toISOString(),
            days,
          },
          revenue: {
            grossSales,
            discounts,
            refunds,
            netSales,
          },
          cogs: {
            breakdown: cogsBreakdown,
            totalCOGS,
            cogsPercentage,
          },
          grossProfit: {
            amount: grossProfit,
            margin: grossProfitMargin,
          },
          operatingExpenses: {
            breakdown: opexBreakdown,
            totalOperatingExpenses,
            opexPercentage,
          },
          netProfit: {
            amount: netProfit,
            margin: netProfitMargin,
          },
          keyMetrics: {
            foodCostPercentage,
            laborCostPercentage,
            primeCost,
            primeCostPercentage,
            breakEvenRevenue,
          },
        };

        return report;
      }
    );

    // Record cache hit
    if (report) {
      cacheMonitor.recordHit();
    }

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('[P&L Report API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to generate P&L report' },
      { status: 500 }
    );
  }
}
