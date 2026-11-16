import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { Prisma } from '@prisma/client';
import {
  getBusinessDate,
  toDbBusinessDate,
  type BusinessDate,
} from '@/lib/time/business-day';
import { paymentBusinessDateRangeWhere } from '@/lib/services/reporting/payment-business-date';

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
    /** Σ Order.subtotalAmount — pre-tax, pre-service, pre-discount. */
    grossSales: number;
    discounts: number;
    tax: number;
    service: number;
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
// Helpers
// ============================================================================

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function isRealDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function calendarDateInTimeZone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Unable to read ${type} for ${timezone}`);
    return value;
  };
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/**
 * Accept either a business date (`YYYY-MM-DD`) or an instant. An instant is
 * reduced to the restaurant-local calendar date, so the caller's "1 February"
 * means the same date regardless of the browser's UTC offset.
 */
function parseBusinessDateInput(
  value: string,
  label: string,
  timezone: string
): BusinessDate {
  const trimmed = value.trim();
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    if (!isRealDateOnly(trimmed)) {
      throw new Error(`${label} must be a valid date`);
    }
    return trimmed;
  }

  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  const date = calendarDateInTimeZone(instant, timezone);
  if (!isRealDateOnly(date)) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

function firstDayOfMonth(date: BusinessDate): BusinessDate {
  return `${date.slice(0, 7)}-01`;
}

function inclusiveDays(start: BusinessDate, end: BusinessDate): number {
  return (
    Math.round(
      (toDbBusinessDate(end).getTime() - toDbBusinessDate(start).getTime()) /
        DAY_MS
    ) + 1
  );
}

function toDecimal(
  value: Prisma.Decimal | number | string | null | undefined
): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value.toString());
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
      const hasPermission =
        authResult.user.permissions?.includes('reports.view') ?? false;

      if (!hasPermission) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 403 });
    }

    // The P&L is a business-date report. Resolve the restaurant clock first so
    // the order and refund ranges match the Z and loyalty reports instead of
    // using UTC/server calendar midnights.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true, businessDayCloseTime: true },
    });
    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }
    const clock = {
      timezone: restaurant.timezone || 'Asia/Kuala_Lumpur',
      closeTime: restaurant.businessDayCloseTime || '04:00',
    };

    const now = new Date();
    const currentBusinessDate = getBusinessDate(now, clock);
    let startBusinessDate: BusinessDate;
    let endBusinessDate: BusinessDate;
    try {
      startBusinessDate = startDate
        ? parseBusinessDateInput(startDate, 'startDate', clock.timezone)
        : firstDayOfMonth(currentBusinessDate);
      endBusinessDate = endDate
        ? parseBusinessDateInput(endDate, 'endDate', clock.timezone)
        : currentBusinessDate;
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 }
      );
    }

    if (endBusinessDate < startBusinessDate) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    const expenseStart = toDbBusinessDate(startBusinessDate);
    const expenseEnd = toDbBusinessDate(endBusinessDate);

    // Generate P&L report
    {
      // ================================================================
      // 1. Calculate Revenue Section
      // ================================================================

      // The revenue set is every order with at least one positive PAID payment
      // attributed to the business-date range. Attribution is shared with the
      // Z and the loyalty report (REVIEW-29 B-PAY-2): the batch `businessDate`
      // when one exists, else the payment's `createdAt` through the restaurant
      // clock. An offline replay after the cutoff therefore stays on the
      // offline day instead of moving the sale. A paid-then-cancelled order
      // still contributes its total here and its refund offsets it to zero.
      const revenueData = await prisma.order.aggregate({
        where: {
          restaurantId,
          payments: {
            some: {
              status: 'PAID',
              amount: { gt: 0 },
              ...paymentBusinessDateRangeWhere(
                startBusinessDate,
                endBusinessDate,
                clock
              ),
            },
          },
        },
        _sum: {
          subtotalAmount: true,
          discountAmount: true,
          taxAmount: true,
          serviceCharge: true,
          totalAmount: true,
        },
      });

      // `grossSales` is pre-discount and pre-tax/service. `totalAmount` already
      // contains discount, tax and service, so `netSales` is the order-total
      // basis minus refunds — never `gross − discounts − refunds` (§18.20.8).
      const grossSales = toDecimal(revenueData._sum.subtotalAmount);
      const discounts = toDecimal(revenueData._sum.discountAmount);
      const tax = toDecimal(revenueData._sum.taxAmount);
      const service = toDecimal(revenueData._sum.serviceCharge);
      const orderTotal = toDecimal(revenueData._sum.totalAmount);

      // Refunds are recorded as `Payment { amount: -x, status: 'PAID' }`, not
      // as `REFUNDED` payments. Sum the negative payments by the refund's own
      // business date and report the magnitude; `netSales` subtracts it once.
      const refundsData = await prisma.payment.aggregate({
        where: {
          order: { restaurantId },
          amount: { lt: 0 },
          ...paymentBusinessDateRangeWhere(
            startBusinessDate,
            endBusinessDate,
            clock
          ),
        },
        _sum: {
          amount: true,
        },
      });

      const refunds = toDecimal(refundsData._sum.amount).abs();
      const netSales = orderTotal.minus(refunds);
      const netSalesValue = netSales.toNumber();

      // ================================================================
      // 2. Calculate COGS Section (from expenses table directly)
      // ================================================================

      const cogsData = await prisma.$queryRaw<
        Array<{
          category_name: string;
          total_amount: Prisma.Decimal;
        }>
      >`
          SELECT
            ec.name as category_name,
            SUM(e.amount) as total_amount
          FROM expenses e
          JOIN expense_categories ec ON e."categoryId" = ec.id
          WHERE e."restaurantId" = ${restaurantId}
            AND e."expenseDate" >= ${expenseStart}
            AND e."expenseDate" <= ${expenseEnd}
            AND ec."categoryType" = 'COGS'
          GROUP BY ec.name
          ORDER BY total_amount DESC
        `;

      const cogsBreakdown = cogsData.map((item) => ({
        categoryName: item.category_name,
        amount: Number(item.total_amount),
        percentage:
          netSalesValue > 0
            ? (Number(item.total_amount) / netSalesValue) * 100
            : 0,
      }));

      const totalCOGS = cogsBreakdown.reduce(
        (sum, item) => sum + item.amount,
        0
      );
      const cogsPercentage =
        netSalesValue > 0 ? (totalCOGS / netSalesValue) * 100 : 0;

      // ================================================================
      // 3. Calculate Gross Profit
      // ================================================================

      const grossProfit = netSalesValue - totalCOGS;
      const grossProfitMargin =
        netSalesValue > 0 ? (grossProfit / netSalesValue) * 100 : 0;

      // ================================================================
      // 4. Calculate Operating Expenses (from expenses table directly)
      // ================================================================

      const opexData = await prisma.$queryRaw<
        Array<{
          category_name: string;
          total_amount: Prisma.Decimal;
        }>
      >`
          SELECT
            ec.name as category_name,
            SUM(e.amount) as total_amount
          FROM expenses e
          JOIN expense_categories ec ON e."categoryId" = ec.id
          WHERE e."restaurantId" = ${restaurantId}
            AND e."expenseDate" >= ${expenseStart}
            AND e."expenseDate" <= ${expenseEnd}
            AND ec."categoryType" = 'OPERATING'
          GROUP BY ec.name
          ORDER BY total_amount DESC
        `;

      const opexBreakdown = opexData.map((item) => ({
        categoryName: item.category_name,
        amount: Number(item.total_amount),
        percentage:
          netSalesValue > 0
            ? (Number(item.total_amount) / netSalesValue) * 100
            : 0,
      }));

      const totalOperatingExpenses = opexBreakdown.reduce(
        (sum, item) => sum + item.amount,
        0
      );
      const opexPercentage =
        netSalesValue > 0 ? (totalOperatingExpenses / netSalesValue) * 100 : 0;

      // ================================================================
      // 5. Calculate Net Profit
      // ================================================================

      const netProfit = grossProfit - totalOperatingExpenses;
      const netProfitMargin =
        netSalesValue > 0 ? (netProfit / netSalesValue) * 100 : 0;

      // ================================================================
      // 6. Calculate Key Metrics
      // ================================================================

      // Food cost (from COGS breakdown)
      const foodCost =
        cogsBreakdown.find((item) =>
          item.categoryName.toLowerCase().includes('food')
        )?.amount || 0;
      const foodCostPercentage =
        netSalesValue > 0 ? (foodCost / netSalesValue) * 100 : 0;

      // Labor cost (from operating expenses)
      const laborCost =
        opexBreakdown.find(
          (item) =>
            item.categoryName.toLowerCase().includes('salaries') ||
            item.categoryName.toLowerCase().includes('wages')
        )?.amount || 0;
      const laborCostPercentage =
        netSalesValue > 0 ? (laborCost / netSalesValue) * 100 : 0;

      // Prime cost (COGS + Labor)
      const primeCost = totalCOGS + laborCost;
      const primeCostPercentage =
        netSalesValue > 0 ? (primeCost / netSalesValue) * 100 : 0;

      // Break-even revenue (total expenses / (1 - target profit margin))
      // Assuming 10% target profit margin
      const totalExpenses = totalCOGS + totalOperatingExpenses;
      const breakEvenRevenue = totalExpenses / 0.9; // 10% profit margin

      // ================================================================
      // 7. Build Report Object
      // ================================================================

      const days = inclusiveDays(startBusinessDate, endBusinessDate);

      const report: ProfitLossReport = {
        period: {
          startDate: toDbBusinessDate(startBusinessDate).toISOString(),
          endDate: toDbBusinessDate(endBusinessDate).toISOString(),
          days,
        },
        revenue: {
          grossSales: grossSales.toNumber(),
          discounts: discounts.toNumber(),
          tax: tax.toNumber(),
          service: service.toNumber(),
          refunds: refunds.toNumber(),
          netSales: netSalesValue,
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

      return NextResponse.json({
        success: true,
        report,
      });
    }
  } catch (error) {
    console.error('[P&L Report API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to generate P&L report' },
      { status: 500 }
    );
  }
}
