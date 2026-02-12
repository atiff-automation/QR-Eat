/**
 * Test Suite: Expense API Routes (Create, Update, Delete)
 *
 * Covers all fixes applied:
 * - Non-UUID categoryId acceptance (e.g., 'system-cogs-food')
 * - YYYY-MM-DD date validation (no timezone issues)
 * - Future date rejection using string comparison
 * - Decimal amount handling (Prisma serializes Decimal as string)
 * - Authentication & authorization
 * - Category existence verification
 * - Proper error messages
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

import * as ExpenseRoute from '@/app/api/admin/expenses/route';
import * as ExpenseDetailRoute from '@/app/api/admin/expenses/[id]/route';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: { findFirst: jest.fn() },
    expense: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    expenseCategory: { findFirst: jest.fn() },
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
const EXPENSE_ID = 'expense-uuid-001';

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

function createPostRequest(body: Record<string, unknown>): NextRequest {
  const request = new NextRequest('http://localhost:3000/api/admin/expenses', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  request.cookies.set('qr_rbac_token', 'valid-token');
  return request;
}

function createGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/admin/expenses');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const request = new NextRequest(url.toString(), { method: 'GET' });
  request.cookies.set('qr_rbac_token', 'valid-token');
  return request;
}

function createPutRequest(body: Record<string, unknown>): NextRequest {
  const request = new NextRequest(
    `http://localhost:3000/api/admin/expenses/${EXPENSE_ID}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
  request.cookies.set('qr_rbac_token', 'valid-token');
  return request;
}

function createDeleteRequest(): NextRequest {
  const request = new NextRequest(
    `http://localhost:3000/api/admin/expenses/${EXPENSE_ID}`,
    { method: 'DELETE' }
  );
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

// Today's date as YYYY-MM-DD for testing future date rejection
function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ============================================================================
// POST /api/admin/expenses — Create Expense
// ============================================================================

describe('POST /api/admin/expenses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when no auth token is provided', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/admin/expenses',
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      // No cookie set

      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('returns 401 when token is invalid', async () => {
      (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
        isValid: false,
        user: null,
      });

      const request = createPostRequest({});
      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });
  });

  describe('non-UUID categoryId acceptance', () => {
    it('accepts system category ID like "system-cogs-food"', async () => {
      setupOwnerAuth();
      (prisma.expenseCategory.findFirst as jest.Mock).mockResolvedValue({
        id: 'system-cogs-food',
        name: 'Food & Ingredients',
      });
      (prisma.expense.create as jest.Mock).mockResolvedValue({
        id: 'new-expense-id',
        categoryId: 'system-cogs-food',
        amount: 100,
        description: 'Food supplies',
        expenseDate: new Date('2026-02-12'),
        category: {
          id: 'system-cogs-food',
          name: 'Food & Ingredients',
          categoryType: 'COGS',
        },
      });

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'system-cogs-food',
        amount: 100,
        description: 'Food supplies',
        expenseDate: '2026-02-12',
        paymentMethod: 'CASH',
      });

      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.expense.categoryId).toBe('system-cogs-food');
    });

    it('accepts system category ID like "system-operating-rent"', async () => {
      setupOwnerAuth();
      (prisma.expenseCategory.findFirst as jest.Mock).mockResolvedValue({
        id: 'system-operating-rent',
        name: 'Rent & Lease',
      });
      (prisma.expense.create as jest.Mock).mockResolvedValue({
        id: 'new-expense-id',
        categoryId: 'system-operating-rent',
        amount: 2000,
        description: 'Monthly rent',
        expenseDate: new Date('2026-02-01'),
        category: {
          id: 'system-operating-rent',
          name: 'Rent & Lease',
          categoryType: 'OPERATING',
        },
      });

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'system-operating-rent',
        amount: 2000,
        description: 'Monthly rent',
        expenseDate: '2026-02-01',
        paymentMethod: 'BANK_TRANSFER',
      });

      const response = await ExpenseRoute.POST(request);
      expect(response.status).toBe(201);
    });
  });

  describe('date validation (YYYY-MM-DD)', () => {
    it('accepts valid YYYY-MM-DD date string', async () => {
      setupOwnerAuth();
      (prisma.expenseCategory.findFirst as jest.Mock).mockResolvedValue({
        id: 'cat-1',
        name: 'Test',
      });
      (prisma.expense.create as jest.Mock).mockResolvedValue({
        id: 'exp-1',
        expenseDate: new Date('2026-02-10'),
        category: { id: 'cat-1', name: 'Test', categoryType: 'COGS' },
      });

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'cat-1',
        amount: 50,
        description: 'Test',
        expenseDate: '2026-02-10',
        paymentMethod: 'CASH',
      });

      const response = await ExpenseRoute.POST(request);
      expect(response.status).toBe(201);
    });

    it('rejects future date', async () => {
      setupOwnerAuth();

      // Create a date 1 year in the future
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'system-cogs-food',
        amount: 100,
        description: 'Future expense',
        expenseDate: futureDateStr,
        paymentMethod: 'CASH',
      });

      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Expense date cannot be in the future');
    });

    it('accepts today as expense date', async () => {
      setupOwnerAuth();
      (prisma.expenseCategory.findFirst as jest.Mock).mockResolvedValue({
        id: 'cat-1',
        name: 'Test',
      });
      (prisma.expense.create as jest.Mock).mockResolvedValue({
        id: 'exp-1',
        expenseDate: new Date(),
        category: { id: 'cat-1', name: 'Test', categoryType: 'COGS' },
      });

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'cat-1',
        amount: 50,
        description: 'Today expense',
        expenseDate: todayStr(),
        paymentMethod: 'CASH',
      });

      const response = await ExpenseRoute.POST(request);
      expect(response.status).toBe(201);
    });

    it('rejects invalid date format', async () => {
      setupOwnerAuth();

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'cat-1',
        amount: 50,
        description: 'Test',
        expenseDate: '12/02/2026', // Wrong format
        paymentMethod: 'CASH',
      });

      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });
  });

  describe('category existence verification', () => {
    it('returns 404 when category does not exist', async () => {
      setupOwnerAuth();
      (prisma.expenseCategory.findFirst as jest.Mock).mockResolvedValue(null);

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'nonexistent-category',
        amount: 100,
        description: 'Test',
        expenseDate: '2026-02-10',
        paymentMethod: 'CASH',
      });

      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe(
        'Category not found or not available for this restaurant'
      );
    });
  });

  describe('authorization', () => {
    it('returns 403 when owner does not own the restaurant', async () => {
      (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue(
        mockAuthOwner
      );
      (prisma.restaurant.findFirst as jest.Mock).mockResolvedValue(null);

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'cat-1',
        amount: 50,
        description: 'Test',
        expenseDate: '2026-02-10',
        paymentMethod: 'CASH',
      });

      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Access denied to this restaurant');
    });

    it('returns 403 when staff lacks expenses.create permission', async () => {
      setupStaffAuth(false);

      const request = createPostRequest({
        restaurantId: RESTAURANT_ID,
        categoryId: 'cat-1',
        amount: 50,
        description: 'Test',
        expenseDate: '2026-02-10',
        paymentMethod: 'CASH',
      });

      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Insufficient permissions');
    });
  });

  describe('validation error messages', () => {
    it('provides structured validation errors for invalid input', async () => {
      setupOwnerAuth();

      const request = createPostRequest({
        restaurantId: 'not-a-uuid',
        categoryId: '',
        amount: -5,
        description: '',
        expenseDate: '',
        paymentMethod: 'INVALID',
      });

      const response = await ExpenseRoute.POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(Array.isArray(data.details)).toBe(true);
      expect(data.details.length).toBeGreaterThan(0);

      // Each detail should have field and message
      for (const detail of data.details) {
        expect(detail).toHaveProperty('field');
        expect(detail).toHaveProperty('message');
      }
    });
  });
});

// ============================================================================
// GET /api/admin/expenses — List Expenses
// ============================================================================

describe('GET /api/admin/expenses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when restaurantId is missing', async () => {
    setupOwnerAuth();

    const request = createGetRequest();
    const response = await ExpenseRoute.GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Restaurant ID is required');
  });

  it('returns expenses with pagination', async () => {
    setupOwnerAuth();
    (prisma.expense.count as jest.Mock).mockResolvedValue(2);
    (prisma.expense.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'exp-1',
        amount: 100,
        description: 'Food',
        expenseDate: new Date('2026-02-10'),
        category: {
          id: 'system-cogs-food',
          name: 'Food & Ingredients',
          categoryType: 'COGS',
        },
      },
      {
        id: 'exp-2',
        amount: 200,
        description: 'Rent',
        expenseDate: new Date('2026-02-01'),
        category: {
          id: 'system-operating-rent',
          name: 'Rent & Lease',
          categoryType: 'OPERATING',
        },
      },
    ]);

    const request = createGetRequest({ restaurantId: RESTAURANT_ID });
    const response = await ExpenseRoute.GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.expenses).toHaveLength(2);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.totalCount).toBe(2);
  });
});

// ============================================================================
// PUT /api/admin/expenses/[id] — Update Expense
// ============================================================================

describe('PUT /api/admin/expenses/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const params = { id: EXPENSE_ID };

  it('accepts non-UUID categoryId in updates', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      restaurantId: RESTAURANT_ID,
      categoryId: 'system-cogs-food',
    });
    (prisma.expenseCategory.findFirst as jest.Mock).mockResolvedValue({
      id: 'system-operating-rent',
    });
    (prisma.expense.update as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      categoryId: 'system-operating-rent',
      category: {
        id: 'system-operating-rent',
        name: 'Rent & Lease',
        categoryType: 'OPERATING',
      },
    });

    const request = createPutRequest({
      categoryId: 'system-operating-rent',
    });

    const response = await ExpenseDetailRoute.PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('accepts YYYY-MM-DD date string in updates', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      restaurantId: RESTAURANT_ID,
      categoryId: 'cat-1',
    });
    (prisma.expense.update as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      expenseDate: new Date('2026-02-05'),
      category: { id: 'cat-1', name: 'Test', categoryType: 'COGS' },
    });

    const request = createPutRequest({ expenseDate: '2026-02-05' });
    const response = await ExpenseDetailRoute.PUT(request, { params });

    expect(response.status).toBe(200);
  });

  it('rejects future date in updates', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      restaurantId: RESTAURANT_ID,
      categoryId: 'cat-1',
    });

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;

    const request = createPutRequest({ expenseDate: futureDateStr });
    const response = await ExpenseDetailRoute.PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Expense date cannot be in the future');
  });

  it('returns 404 when expense does not exist', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue(null);

    const request = createPutRequest({ amount: 200 });
    const response = await ExpenseDetailRoute.PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Expense not found');
  });

  it('accepts numeric amount (not string)', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      restaurantId: RESTAURANT_ID,
      categoryId: 'cat-1',
    });
    (prisma.expense.update as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      amount: 250.5,
      category: { id: 'cat-1', name: 'Test', categoryType: 'COGS' },
    });

    const request = createPutRequest({ amount: 250.5 });
    const response = await ExpenseDetailRoute.PUT(request, { params });

    expect(response.status).toBe(200);
  });

  it('rejects string amount in update (Prisma Decimal bug)', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      restaurantId: RESTAURANT_ID,
      categoryId: 'cat-1',
    });

    const request = createPutRequest({ amount: '250.50' });
    const response = await ExpenseDetailRoute.PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('verifies new category exists when changing category', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      restaurantId: RESTAURANT_ID,
      categoryId: 'old-cat',
    });
    (prisma.expenseCategory.findFirst as jest.Mock).mockResolvedValue(null);

    const request = createPutRequest({
      categoryId: 'nonexistent-category',
    });
    const response = await ExpenseDetailRoute.PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe(
      'Category not found or not available for this restaurant'
    );
  });
});

// ============================================================================
// DELETE /api/admin/expenses/[id] — Delete Expense
// ============================================================================

describe('DELETE /api/admin/expenses/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const params = { id: EXPENSE_ID };

  it('allows owner to delete expense', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      restaurantId: RESTAURANT_ID,
      description: 'Test',
      amount: 100,
    });
    (prisma.expense.delete as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
    });

    const request = createDeleteRequest();
    const response = await ExpenseDetailRoute.DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Expense deleted successfully');
  });

  it('prevents staff from deleting expenses', async () => {
    setupStaffAuth(true);

    (prisma.expense.findUnique as jest.Mock).mockResolvedValue({
      id: EXPENSE_ID,
      restaurantId: RESTAURANT_ID,
      description: 'Test',
      amount: 100,
    });

    const request = createDeleteRequest();
    const response = await ExpenseDetailRoute.DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Only restaurant owners can delete expenses');
  });

  it('returns 404 when expense does not exist', async () => {
    setupOwnerAuth();
    (prisma.expense.findUnique as jest.Mock).mockResolvedValue(null);

    const request = createDeleteRequest();
    const response = await ExpenseDetailRoute.DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Expense not found');
  });

  it('returns 401 when no token provided', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/admin/expenses/${EXPENSE_ID}`,
      { method: 'DELETE' }
    );
    // No cookie

    const response = await ExpenseDetailRoute.DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });
});
