/**
 * Test Suite: /api/admin/expenses/summary Endpoint
 *
 * Covers:
 * - Authentication (no token, invalid token)
 * - Authorization (owner access, staff access, staff without permission, wrong restaurant)
 * - Aggregation logic (COGS, OPERATING, OTHER grouping)
 * - Trend calculation (increase, decrease, zero previous, zero both)
 * - Date range handling (explicit dates, default to current month)
 * - Missing required params (no restaurantId)
 * - Database error handling
 * - Edge cases (no expenses, single category type, null amounts)
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

// Import the route handler
import * as SummaryRoute from '@/app/api/admin/expenses/summary/route';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: {
      findFirst: jest.fn(),
    },
    expense: {
      groupBy: jest.fn(),
    },
    expenseCategory: {
      findMany: jest.fn(),
    },
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

const RESTAURANT_ID = 'rest-uuid-001';
const OWNER_USER_ID = 'owner-uuid-001';
const STAFF_USER_ID = 'staff-uuid-001';

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/admin/expenses/summary');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  return {
    method: 'GET',
    url: url.toString(),
    cookies: {
      get: jest.fn((name: string) => {
        if (name === 'qr_rbac_token') return { value: 'valid-token' };
        return undefined;
      }),
    },
  } as unknown as NextRequest;
}

function createUnauthenticatedRequest(
  params: Record<string, string> = {}
): NextRequest {
  const url = new URL('http://localhost:3000/api/admin/expenses/summary');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  return {
    method: 'GET',
    url: url.toString(),
    cookies: {
      get: jest.fn(() => undefined),
    },
  } as unknown as NextRequest;
}

function mockOwnerAuth() {
  (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
    isValid: true,
    user: {
      id: OWNER_USER_ID,
      userType: 'restaurant_owner',
      currentRole: { userType: 'restaurant_owner' },
    },
  });
  (prisma.restaurant.findFirst as jest.Mock).mockResolvedValue({
    id: RESTAURANT_ID,
  });
}

function mockStaffAuth(hasPermission = true) {
  (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
    isValid: true,
    user: {
      id: STAFF_USER_ID,
      userType: 'staff',
      currentRole: {
        userType: 'staff',
        restaurantId: RESTAURANT_ID,
      },
    },
  });
  (AuthServiceV2.checkPermission as jest.Mock).mockResolvedValue(hasPermission);
}

/** Helper to create Prisma Decimal-like objects */
function decimal(value: number) {
  return { toNumber: () => value };
}

function mockExpenseData(
  currentExpenses: Array<{ categoryId: string; amount: number }>,
  previousExpenses: Array<{ categoryId: string; amount: number }>,
  categoryMap: Array<{ id: string; categoryType: string }>
) {
  // First call = current period, second call = previous period
  (prisma.expense.groupBy as jest.Mock)
    .mockResolvedValueOnce(
      currentExpenses.map((e) => ({
        categoryId: e.categoryId,
        _sum: { amount: decimal(e.amount) },
      }))
    )
    .mockResolvedValueOnce(
      previousExpenses.map((e) => ({
        categoryId: e.categoryId,
        _sum: { amount: decimal(e.amount) },
      }))
    );

  // Category lookups — called once for current, once for previous
  const currentCatIds = currentExpenses.map((e) => e.categoryId);
  const prevCatIds = previousExpenses.map((e) => e.categoryId);

  (prisma.expenseCategory.findMany as jest.Mock)
    .mockResolvedValueOnce(
      categoryMap.filter((c) => currentCatIds.includes(c.id))
    )
    .mockResolvedValueOnce(
      categoryMap.filter((c) => prevCatIds.includes(c.id))
    );
}

// ============================================================================
// Tests
// ============================================================================

describe('/api/admin/expenses/summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Authentication
  // --------------------------------------------------------------------------
  describe('Authentication', () => {
    it('should return 401 when no auth token is provided', async () => {
      const request = createUnauthenticatedRequest({
        restaurantId: RESTAURANT_ID,
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe('Authentication required');
    });

    it('should return 401 when token validation fails', async () => {
      (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
        isValid: false,
        user: null,
      });

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe('Authentication required');
    });

    it('should read token from qr_auth_token fallback cookie', async () => {
      mockOwnerAuth();
      mockExpenseData([], [], []);

      const url = new URL('http://localhost:3000/api/admin/expenses/summary');
      url.searchParams.set('restaurantId', RESTAURANT_ID);

      const request = {
        method: 'GET',
        url: url.toString(),
        cookies: {
          get: jest.fn((name: string) => {
            if (name === 'qr_rbac_token') return undefined;
            if (name === 'qr_auth_token') return { value: 'fallback-token' };
            return undefined;
          }),
        },
      } as unknown as NextRequest;

      const response = await SummaryRoute.GET(request);

      expect(response.status).toBe(200);
      expect(AuthServiceV2.validateToken).toHaveBeenCalledWith(
        'fallback-token'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Authorization
  // --------------------------------------------------------------------------
  describe('Authorization', () => {
    it('should allow restaurant owner to access their restaurant', async () => {
      mockOwnerAuth();
      mockExpenseData([], [], []);

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await SummaryRoute.GET(request);

      expect(response.status).toBe(200);
      expect(prisma.restaurant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: RESTAURANT_ID, ownerId: OWNER_USER_ID },
        })
      );
    });

    it('should deny restaurant owner access to another restaurant', async () => {
      (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
        isValid: true,
        user: {
          id: OWNER_USER_ID,
          userType: 'restaurant_owner',
          currentRole: { userType: 'restaurant_owner' },
        },
      });
      (prisma.restaurant.findFirst as jest.Mock).mockResolvedValue(null);

      const request = createRequest({ restaurantId: 'other-restaurant-id' });
      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe('Access denied to this restaurant');
    });

    it('should allow staff with expenses.view permission', async () => {
      mockStaffAuth(true);
      mockExpenseData([], [], []);

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await SummaryRoute.GET(request);

      expect(response.status).toBe(200);
      expect(AuthServiceV2.checkPermission).toHaveBeenCalledWith(
        STAFF_USER_ID,
        'expenses.view'
      );
    });

    it('should deny staff without expenses.view permission', async () => {
      mockStaffAuth(false);

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe('Insufficient permissions');
    });

    it('should deny staff accessing a different restaurant', async () => {
      (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
        isValid: true,
        user: {
          id: STAFF_USER_ID,
          userType: 'staff',
          currentRole: {
            userType: 'staff',
            restaurantId: 'different-restaurant',
          },
        },
      });

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe('Access denied to this restaurant');
    });

    it('should deny unknown user types', async () => {
      (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
        isValid: true,
        user: {
          id: 'some-id',
          userType: 'customer',
          currentRole: { userType: 'customer' },
        },
      });

      const request = createRequest({ restaurantId: RESTAURANT_ID });
      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe('Invalid user type');
    });
  });

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------
  describe('Validation', () => {
    it('should return 400 when restaurantId is missing', async () => {
      mockOwnerAuth();

      const request = createRequest({}); // no restaurantId
      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Restaurant ID is required');
    });
  });

  // --------------------------------------------------------------------------
  // Aggregation Logic
  // --------------------------------------------------------------------------
  describe('Expense Aggregation', () => {
    it('should aggregate expenses by category type (COGS, OPERATING, OTHER)', async () => {
      mockOwnerAuth();

      const categories = [
        { id: 'cat-cogs-1', categoryType: 'COGS' },
        { id: 'cat-cogs-2', categoryType: 'COGS' },
        { id: 'cat-op-1', categoryType: 'OPERATING' },
        { id: 'cat-other-1', categoryType: 'OTHER' },
      ];

      mockExpenseData(
        [
          { categoryId: 'cat-cogs-1', amount: 100 },
          { categoryId: 'cat-cogs-2', amount: 50 },
          { categoryId: 'cat-op-1', amount: 200 },
          { categoryId: 'cat-other-1', amount: 30 },
        ],
        [], // no previous period
        categories
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.cogs).toBe(150); // 100 + 50
      expect(body.operating).toBe(200);
      expect(body.total).toBe(380); // 150 + 200 + 30
    });

    it('should return zeros when no expenses exist', async () => {
      mockOwnerAuth();
      mockExpenseData([], [], []);

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.total).toBe(0);
      expect(body.cogs).toBe(0);
      expect(body.operating).toBe(0);
      expect(body.trend.total).toBe(0);
      expect(body.trend.cogs).toBe(0);
      expect(body.trend.operating).toBe(0);
    });

    it('should handle expenses with null amounts gracefully', async () => {
      mockOwnerAuth();

      // Manual mock with null _sum.amount
      (prisma.expense.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          {
            categoryId: 'cat-1',
            _sum: { amount: null },
          },
        ])
        .mockResolvedValueOnce([]);

      (prisma.expenseCategory.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'cat-1', categoryType: 'COGS' }])
        .mockResolvedValueOnce([]);

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.cogs).toBe(0); // null falls back to 0 via ?? 0
      expect(body.total).toBe(0);
    });

    it('should handle expenses with only one category type', async () => {
      mockOwnerAuth();

      mockExpenseData(
        [{ categoryId: 'cat-op-1', amount: 500 }],
        [],
        [{ id: 'cat-op-1', categoryType: 'OPERATING' }]
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.cogs).toBe(0);
      expect(body.operating).toBe(500);
      expect(body.total).toBe(500);
    });
  });

  // --------------------------------------------------------------------------
  // Trend Calculation
  // --------------------------------------------------------------------------
  describe('Trend Calculation', () => {
    it('should calculate positive trend (expenses increased)', async () => {
      mockOwnerAuth();

      const categories = [{ id: 'cat-1', categoryType: 'COGS' }];

      mockExpenseData(
        [{ categoryId: 'cat-1', amount: 200 }], // current
        [{ categoryId: 'cat-1', amount: 100 }], // previous
        categories
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-02-01T00:00:00.000Z',
        endDate: '2025-02-28T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(body.trend.total).toBe(100); // (200-100)/100 * 100 = 100%
      expect(body.trend.cogs).toBe(100);
    });

    it('should calculate negative trend (expenses decreased)', async () => {
      mockOwnerAuth();

      const categories = [{ id: 'cat-1', categoryType: 'OPERATING' }];

      mockExpenseData(
        [{ categoryId: 'cat-1', amount: 50 }], // current
        [{ categoryId: 'cat-1', amount: 200 }], // previous
        categories
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-02-01T00:00:00.000Z',
        endDate: '2025-02-28T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(body.trend.operating).toBe(-75); // (50-200)/200 * 100 = -75%
    });

    it('should return 100% trend when previous period had zero expenses', async () => {
      mockOwnerAuth();

      const categories = [{ id: 'cat-1', categoryType: 'COGS' }];

      mockExpenseData(
        [{ categoryId: 'cat-1', amount: 300 }], // current has data
        [], // previous has nothing
        categories
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-02-01T00:00:00.000Z',
        endDate: '2025-02-28T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(body.trend.total).toBe(100);
      expect(body.trend.cogs).toBe(100);
    });

    it('should return 0% trend when both periods have zero expenses', async () => {
      mockOwnerAuth();
      mockExpenseData([], [], []);

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-02-01T00:00:00.000Z',
        endDate: '2025-02-28T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(body.trend.total).toBe(0);
      expect(body.trend.cogs).toBe(0);
      expect(body.trend.operating).toBe(0);
    });

    it('should calculate correct mixed trends per category type', async () => {
      mockOwnerAuth();

      const categories = [
        { id: 'cat-cogs', categoryType: 'COGS' },
        { id: 'cat-op', categoryType: 'OPERATING' },
      ];

      mockExpenseData(
        [
          { categoryId: 'cat-cogs', amount: 300 }, // up from 100
          { categoryId: 'cat-op', amount: 50 }, // down from 200
        ],
        [
          { categoryId: 'cat-cogs', amount: 100 },
          { categoryId: 'cat-op', amount: 200 },
        ],
        categories
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-02-01T00:00:00.000Z',
        endDate: '2025-02-28T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(body.trend.cogs).toBeCloseTo(200); // (300-100)/100 * 100
      expect(body.trend.operating).toBeCloseTo(-75); // (50-200)/200 * 100
      // total: (350-300)/300 * 100 ≈ 16.67
      expect(body.trend.total).toBeCloseTo(16.667, 1);
    });
  });

  // --------------------------------------------------------------------------
  // Date Range Handling
  // --------------------------------------------------------------------------
  describe('Date Range Handling', () => {
    it('should use provided startDate and endDate', async () => {
      mockOwnerAuth();
      mockExpenseData([], [], []);

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-03-01T00:00:00.000Z',
        endDate: '2025-03-31T23:59:59.999Z',
      });

      await SummaryRoute.GET(request);

      // Verify the date range was passed to the query
      expect(prisma.expense.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            restaurantId: RESTAURANT_ID,
            expenseDate: {
              gte: new Date('2025-03-01T00:00:00.000Z'),
              lte: new Date('2025-03-31T23:59:59.999Z'),
            },
          }),
        })
      );
    });

    it('should default to current month when no dates provided', async () => {
      mockOwnerAuth();
      mockExpenseData([], [], []);

      const request = createRequest({ restaurantId: RESTAURANT_ID });

      await SummaryRoute.GET(request);

      // First call is the current period — verify it was made
      expect(prisma.expense.groupBy).toHaveBeenCalledTimes(2);

      const firstCallArgs = (prisma.expense.groupBy as jest.Mock).mock
        .calls[0][0];
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // The start date should be the 1st of this month
      expect(firstCallArgs.where.expenseDate.gte.getMonth()).toBe(
        startOfMonth.getMonth()
      );
      expect(firstCallArgs.where.expenseDate.gte.getDate()).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Response Shape
  // --------------------------------------------------------------------------
  describe('Response Shape', () => {
    it('should return correct JSON structure', async () => {
      mockOwnerAuth();

      mockExpenseData(
        [
          { categoryId: 'cat-1', amount: 100 },
          { categoryId: 'cat-2', amount: 200 },
        ],
        [{ categoryId: 'cat-1', amount: 80 }],
        [
          { id: 'cat-1', categoryType: 'COGS' },
          { id: 'cat-2', categoryType: 'OPERATING' },
        ]
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      // Verify all required fields exist
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('cogs');
      expect(body).toHaveProperty('operating');
      expect(body).toHaveProperty('trend');
      expect(body.trend).toHaveProperty('total');
      expect(body.trend).toHaveProperty('cogs');
      expect(body.trend).toHaveProperty('operating');

      // Verify types
      expect(typeof body.total).toBe('number');
      expect(typeof body.cogs).toBe('number');
      expect(typeof body.operating).toBe('number');
      expect(typeof body.trend.total).toBe('number');
      expect(typeof body.trend.cogs).toBe('number');
      expect(typeof body.trend.operating).toBe('number');
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------
  describe('Error Handling', () => {
    it('should return 500 when database throws an error', async () => {
      mockOwnerAuth();
      (prisma.expense.groupBy as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('Failed to fetch expense summary');
    });

    it('should return 500 when category lookup fails', async () => {
      mockOwnerAuth();

      (prisma.expense.groupBy as jest.Mock).mockResolvedValueOnce([
        { categoryId: 'cat-1', _sum: { amount: decimal(100) } },
      ]);
      (prisma.expenseCategory.findMany as jest.Mock).mockRejectedValue(
        new Error('Category lookup failed')
      );

      const request = createRequest({
        restaurantId: RESTAURANT_ID,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.999Z',
      });

      const response = await SummaryRoute.GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('Failed to fetch expense summary');
    });
  });
});
