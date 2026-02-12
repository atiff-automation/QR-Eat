import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

// ============================================================================
// GET Handler - Expense summary aggregated by category type with trend
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

      const hasPermission = await AuthServiceV2.checkPermission(
        authResult.user.id,
        'expenses.view'
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

    // Set default date range (current month) if not provided
    const now = new Date();
    const currentStart = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = endDate ? new Date(endDate) : now;

    // Calculate previous period (same duration, immediately before)
    const periodDuration = currentEnd.getTime() - currentStart.getTime();
    const previousStart = new Date(currentStart.getTime() - periodDuration);
    const previousEnd = new Date(currentStart.getTime() - 1);

    // Aggregate current period expenses by category type
    const currentExpenses = await prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        restaurantId,
        expenseDate: {
          gte: currentStart,
          lte: currentEnd,
        },
      },
      _sum: { amount: true },
    });

    // Get category types for mapping
    const categoryIds = currentExpenses.map((e) => e.categoryId);
    const categories = await prisma.expenseCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, categoryType: true },
    });

    const categoryTypeMap = new Map(
      categories.map((c) => [c.id, c.categoryType])
    );

    // Sum by type
    let currentCogs = 0;
    let currentOperating = 0;
    let currentOther = 0;

    for (const expense of currentExpenses) {
      const amount = expense._sum.amount?.toNumber() ?? 0;
      const type = categoryTypeMap.get(expense.categoryId);
      if (type === 'COGS') currentCogs += amount;
      else if (type === 'OPERATING') currentOperating += amount;
      else currentOther += amount;
    }

    const currentTotal = currentCogs + currentOperating + currentOther;

    // Aggregate previous period for trend comparison
    const previousExpenses = await prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        restaurantId,
        expenseDate: {
          gte: previousStart,
          lte: previousEnd,
        },
      },
      _sum: { amount: true },
    });

    const prevCategoryIds = previousExpenses.map((e) => e.categoryId);
    const prevCategories = await prisma.expenseCategory.findMany({
      where: { id: { in: prevCategoryIds } },
      select: { id: true, categoryType: true },
    });

    const prevCategoryTypeMap = new Map(
      prevCategories.map((c) => [c.id, c.categoryType])
    );

    let prevCogs = 0;
    let prevOperating = 0;
    let prevOther = 0;

    for (const expense of previousExpenses) {
      const amount = expense._sum.amount?.toNumber() ?? 0;
      const type = prevCategoryTypeMap.get(expense.categoryId);
      if (type === 'COGS') prevCogs += amount;
      else if (type === 'OPERATING') prevOperating += amount;
      else prevOther += amount;
    }

    const prevTotal = prevCogs + prevOperating + prevOther;

    // Calculate trend percentages
    const calcTrend = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return NextResponse.json({
      total: currentTotal,
      cogs: currentCogs,
      operating: currentOperating,
      trend: {
        total: calcTrend(currentTotal, prevTotal),
        cogs: calcTrend(currentCogs, prevCogs),
        operating: calcTrend(currentOperating, prevOperating),
      },
    });
  } catch (error) {
    console.error('[Expenses Summary API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense summary' },
      { status: 500 }
    );
  }
}
