/**
 * Test Suite: P&L Report API Route
 *
 * Covers all fixes applied:
 * - Direct table queries (no materialized view dependency)
 * - COGS and OPERATING expense breakdown from expenses + expense_categories
 * - Revenue calculation from orders
 * - Date range filtering
 * - Key metrics calculation (food cost %, labor cost %, prime cost)
 * - Authentication & authorization
 * - Edge cases (zero revenue, no expenses, missing params)
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

import * as ProfitLossRoute from '@/app/api/admin/reports/profit-loss/route';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: { findFirst: jest.fn() },
    order: { aggregate: jest.fn() },
    payment: { aggregate: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/rbac/auth-service', () => ({
  AuthServiceV2: {
    validateToken: jest.fn(),
    checkPermission: jest.fn(),
  },
}));

// ============================================================================
// Test Helpers
// ============================================================================

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OWNER_ID = 'owner-uuid-001';

const mockAuthOwner = {
  isValid: true,
  user: {
    id: OWNER_ID,
    email: 'owner@test.com',
    userType: 'restaurant_owner',
    currentRole: { userType: 'restaurant_owner', restaurantId: RESTAURANT_ID },
  },
};

const mockAuthStaff = {
  isValid: true,
  user: {
    id: 'staff-uuid-001',
    email: 'staff@test.com',
    userType: 'staff',
    currentRole: { userType: 'staff', restaurantId: RESTAURANT_ID },
  },
};

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/admin/reports/profit-loss');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const request = new NextRequest(url.toString(), { method: 'GET' });
  request.cookies.set('qr_rbac_token', 'valid-token');
  return request;
}

function setupOwnerAuth() {
  (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue(mockAuthOwner);
  (prisma.restaurant.findFirst as jest.Mock).mockResolvedValue({
    id: RESTAURANT_ID,
  });
}

function setupStaffAuth(hasPermission = true) {
  (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue(mockAuthStaff);
  (AuthServiceV2.checkPermission as jest.Mock).mockResolvedValue(hasPermission);
}

function setupDefaultMocks(
  overrides: {
    grossSales?: number;
    discounts?: number;
    refunds?: number;
    cogsData?: Array<{ category_name: string; total_amount: number }>;
    opexData?: Array<{ category_name: string; total_amount: number }>;
  } = {}
) {
  const {
    grossSales = 10000,
    discounts = 500,
    refunds = 200,
    cogsData = [
      { category_name: 'Food & Ingredients', total_amount: 3000 },
      { category_name: 'Beverages', total_amount: 500 },
    ],
    opexData = [
      { category_name: 'Salaries & Wages', total_amount: 2000 },
      { category_name: 'Rent & Lease', total_amount: 1500 },
      { category_name: 'Utilities', total_amount: 300 },
    ],
  } = overrides;

  // Revenue
  (prisma.order.aggregate as jest.Mock).mockResolvedValue({
    _sum: {
      totalAmount: grossSales,
      discountAmount: discounts,
    },
  });

  // Refunds
  (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
    _sum: { amount: refunds },
  });

  // $queryRaw is called twice: once for COGS, once for OPERATING
  let queryRawCallCount = 0;
  (prisma.$queryRaw as jest.Mock).mockImplementation(() => {
    queryRawCallCount++;
    if (queryRawCallCount === 1) return Promise.resolve(cogsData);
    return Promise.resolve(opexData);
  });
}

// ============================================================================
// Authentication & Authorization Tests
// ============================================================================

describe('GET /api/admin/reports/profit-loss', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when no token is provided', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/admin/reports/profit-loss?restaurantId=' +
          RESTAURANT_ID,
        { method: 'GET' }
      );

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('returns 401 when token is invalid', async () => {
      (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
        isValid: false,
        user: null,
      });

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await ProfitLossRoute.GET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('authorization', () => {
    it('returns 403 when owner does not own restaurant', async () => {
      (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue(
        mockAuthOwner
      );
      (prisma.restaurant.findFirst as jest.Mock).mockResolvedValue(null);

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Access denied to this restaurant');
    });

    it('returns 403 when staff lacks reports.view permission', async () => {
      setupStaffAuth(false);

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Insufficient permissions');
    });
  });

  describe('required parameters', () => {
    it('returns 400 when restaurantId is missing', async () => {
      setupOwnerAuth();

      const request = createRequest();
      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Restaurant ID is required');
    });

    it('returns 400 when end date is before start date', async () => {
      setupOwnerAuth();

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-15',
        endDate: '2026-02-01',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('End date must be after start date');
    });
  });

  // ============================================================================
  // P&L Report Calculation Tests
  // ============================================================================

  describe('report calculations', () => {
    it('calculates revenue correctly (gross - discounts - refunds)', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 10000,
        discounts: 500,
        refunds: 200,
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.report.revenue.grossSales).toBe(10000);
      expect(data.report.revenue.discounts).toBe(500);
      expect(data.report.revenue.refunds).toBe(200);
      expect(data.report.revenue.netSales).toBe(9300); // 10000 - 500 - 200
    });

    it('calculates COGS breakdown from direct table query', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        cogsData: [
          { category_name: 'Food & Ingredients', total_amount: 3000 },
          { category_name: 'Beverages', total_amount: 500 },
        ],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(data.report.cogs.breakdown).toHaveLength(2);
      expect(data.report.cogs.breakdown[0].categoryName).toBe(
        'Food & Ingredients'
      );
      expect(data.report.cogs.breakdown[0].amount).toBe(3000);
      expect(data.report.cogs.totalCOGS).toBe(3500);
    });

    it('calculates operating expenses from direct table query', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        opexData: [
          { category_name: 'Salaries & Wages', total_amount: 2000 },
          { category_name: 'Rent & Lease', total_amount: 1500 },
        ],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(data.report.operatingExpenses.breakdown).toHaveLength(2);
      expect(data.report.operatingExpenses.totalOperatingExpenses).toBe(3500);
    });

    it('calculates gross profit = net sales - COGS', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 10000,
        discounts: 0,
        refunds: 0,
        cogsData: [{ category_name: 'Food', total_amount: 3000 }],
        opexData: [],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(data.report.grossProfit.amount).toBe(7000); // 10000 - 3000
      expect(data.report.grossProfit.margin).toBe(70); // 7000/10000 * 100
    });

    it('calculates net profit = gross profit - operating expenses', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 10000,
        discounts: 0,
        refunds: 0,
        cogsData: [{ category_name: 'Food', total_amount: 3000 }],
        opexData: [{ category_name: 'Rent', total_amount: 2000 }],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      // Net profit = 10000 - 3000 (COGS) - 2000 (OPEX) = 5000
      expect(data.report.netProfit.amount).toBe(5000);
      expect(data.report.netProfit.margin).toBe(50); // 5000/10000 * 100
    });

    it('calculates food cost percentage correctly', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 10000,
        discounts: 0,
        refunds: 0,
        cogsData: [{ category_name: 'Food & Ingredients', total_amount: 3000 }],
        opexData: [],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(data.report.keyMetrics.foodCostPercentage).toBe(30); // 3000/10000 * 100
    });

    it('calculates labor cost from salaries/wages category', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 10000,
        discounts: 0,
        refunds: 0,
        cogsData: [],
        opexData: [{ category_name: 'Salaries & Wages', total_amount: 2500 }],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(data.report.keyMetrics.laborCostPercentage).toBe(25); // 2500/10000 * 100
    });

    it('calculates prime cost = COGS + labor', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 10000,
        discounts: 0,
        refunds: 0,
        cogsData: [{ category_name: 'Food', total_amount: 3000 }],
        opexData: [
          { category_name: 'Salaries & Wages', total_amount: 2000 },
          { category_name: 'Rent', total_amount: 1000 },
        ],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      // Prime cost = COGS (3000) + Labor (2000) = 5000
      expect(data.report.keyMetrics.primeCost).toBe(5000);
      expect(data.report.keyMetrics.primeCostPercentage).toBe(50);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('handles zero revenue without division errors', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 0,
        discounts: 0,
        refunds: 0,
        cogsData: [],
        opexData: [],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.report.revenue.netSales).toBe(0);
      expect(data.report.grossProfit.margin).toBe(0);
      expect(data.report.netProfit.margin).toBe(0);
      expect(data.report.cogs.cogsPercentage).toBe(0);
      expect(data.report.keyMetrics.foodCostPercentage).toBe(0);
      // No NaN or Infinity
      expect(Number.isFinite(data.report.grossProfit.margin)).toBe(true);
      expect(Number.isFinite(data.report.netProfit.margin)).toBe(true);
    });

    it('handles no expenses (empty COGS and OPEX)', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 5000,
        discounts: 0,
        refunds: 0,
        cogsData: [],
        opexData: [],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.report.cogs.totalCOGS).toBe(0);
      expect(data.report.cogs.breakdown).toHaveLength(0);
      expect(data.report.operatingExpenses.totalOperatingExpenses).toBe(0);
      expect(data.report.grossProfit.amount).toBe(5000);
      expect(data.report.netProfit.amount).toBe(5000);
    });

    it('handles expenses exceeding revenue (net loss)', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 1000,
        discounts: 0,
        refunds: 0,
        cogsData: [{ category_name: 'Food', total_amount: 800 }],
        opexData: [{ category_name: 'Rent', total_amount: 500 }],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.report.netProfit.amount).toBe(-300); // 1000 - 800 - 500
      expect(data.report.netProfit.margin).toBeLessThan(0);
    });

    it('includes period info with correct day count', async () => {
      setupOwnerAuth();
      setupDefaultMocks();

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(data.report.period).toBeDefined();
      expect(data.report.period.days).toBe(28);
    });

    it('handles null aggregation results gracefully', async () => {
      setupOwnerAuth();
      // Simulate null _sum values (no orders/payments in range)
      (prisma.order.aggregate as jest.Mock).mockResolvedValue({
        _sum: { totalAmount: null, discountAmount: null },
      });
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: null },
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let _queryCount = 0;
      (prisma.$queryRaw as jest.Mock).mockImplementation(() => {
        _queryCount++;
        return Promise.resolve([]);
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.report.revenue.grossSales).toBe(0);
      expect(data.report.revenue.discounts).toBe(0);
      expect(data.report.revenue.refunds).toBe(0);
    });

    it('uses direct table queries, not materialized views', async () => {
      setupOwnerAuth();
      setupDefaultMocks();

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      await ProfitLossRoute.GET(request);

      // Verify $queryRaw was called (direct SQL queries to expenses + expense_categories)
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // Once for COGS, once for OPERATING

      // Verify no materialized view refresh was called
      const calls = (prisma.$queryRaw as jest.Mock).mock.calls;
      for (const call of calls) {
        const sql = String(call[0]);
        expect(sql).not.toContain('expense_daily_summary');
        expect(sql).not.toContain('REFRESH MATERIALIZED VIEW');
      }
    });

    it('calculates break-even revenue', async () => {
      setupOwnerAuth();
      setupDefaultMocks({
        grossSales: 10000,
        discounts: 0,
        refunds: 0,
        cogsData: [{ category_name: 'Food', total_amount: 3000 }],
        opexData: [{ category_name: 'Rent', total_amount: 2000 }],
      });

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      // Break-even = total expenses / 0.9 = (3000 + 2000) / 0.9
      const expectedBreakEven = 5000 / 0.9;
      expect(data.report.keyMetrics.breakEvenRevenue).toBeCloseTo(
        expectedBreakEven,
        2
      );
    });
  });

  describe('date range handling', () => {
    it('defaults to current month when no dates provided', async () => {
      setupOwnerAuth();
      setupDefaultMocks();

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await ProfitLossRoute.GET(request);

      expect(response.status).toBe(200);
      // The query should succeed with default date range
    });

    it('accepts explicit date range', async () => {
      setupOwnerAuth();
      setupDefaultMocks();

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      const response = await ProfitLossRoute.GET(request);
      expect(response.status).toBe(200);
    });
  });

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      setupOwnerAuth();
      (prisma.order.aggregate as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      const response = await ProfitLossRoute.GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to generate P&L report');
    });
  });
});
