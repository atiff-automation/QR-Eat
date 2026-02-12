/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Test Suite: Expense & P&L Hooks
 *
 * Validates that all hooks:
 * - Use ApiClient (not raw fetch)
 * - Use centralized queryKeys from query-client.ts
 * - Pass correct endpoints and parameters
 * - Invalidate correct cache keys on mutations
 * - Show correct toast messages on success/error
 *
 * Tests hook configuration only (not rendering) since:
 * - Environment is jest-environment-node (no DOM)
 * - We verify the hook function source/config, not React rendering
 * - require() is used for lazy imports after jest.mock() hoisting
 */

// ============================================================================
// Mocks — all use global jest (no @jest/globals import to avoid scope issues)
// Must be declared before imports since jest.mock is hoisted
// ============================================================================

// Mock TanStack Query — capture the config passed to useQuery/useMutation
// Also provides QueryClient constructor for query-client.ts module-level init
const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({
    defaultOptions: {},
  })),
  useQuery: (...args: unknown[]) => {
    mockUseQuery(...args);
    return { data: null, isLoading: false, error: null };
  },
  useMutation: (...args: unknown[]) => {
    mockUseMutation(...args);
    return { mutateAsync: jest.fn(), isPending: false };
  },
  useQueryClient: () => {
    return { invalidateQueries: mockInvalidateQueries };
  },
}));

// Mock ApiClient
jest.mock('@/lib/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

// ============================================================================
// Helpers
// ============================================================================

function getQueryConfig(
  hookFn: (...args: unknown[]) => unknown,
  ...args: unknown[]
) {
  mockUseQuery.mockClear();
  hookFn(...args);
  return mockUseQuery.mock.calls[0]?.[0];
}

function getMutationConfig(
  hookFn: (...args: unknown[]) => unknown,
  ...args: unknown[]
) {
  mockUseMutation.mockClear();
  hookFn(...args);
  return mockUseMutation.mock.calls[0]?.[0];
}

// ============================================================================
// Tests: Query Hooks (GET)
// ============================================================================

describe('Expense Query Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useExpenseSummary', () => {
    it('should use ApiClient.get with correct endpoint and params', async () => {
      const {
        useExpenseSummary,
      } = require('@/hooks/expenses/useExpenseSummary');
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      const config = getQueryConfig(useExpenseSummary, 'rest-1', start, end);

      // Verify query key uses centralized queryKeys
      expect(config.queryKey).toEqual(
        queryKeys.expenses.summary({
          restaurantId: 'rest-1',
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        })
      );

      // Verify queryFn calls ApiClient.get
      await config.queryFn();
      expect(ApiClient.get).toHaveBeenCalledWith(
        '/api/admin/expenses/summary',
        {
          params: {
            restaurantId: 'rest-1',
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          },
        }
      );
    });

    it('should be disabled when restaurantId is empty', () => {
      const {
        useExpenseSummary,
      } = require('@/hooks/expenses/useExpenseSummary');
      const config = getQueryConfig(
        useExpenseSummary,
        '',
        new Date(),
        new Date()
      );
      expect(config.enabled).toBe(false);
    });

    it('should have 10 minute stale time', () => {
      const {
        useExpenseSummary,
      } = require('@/hooks/expenses/useExpenseSummary');
      const config = getQueryConfig(
        useExpenseSummary,
        'rest-1',
        new Date(),
        new Date()
      );
      expect(config.staleTime).toBe(10 * 60 * 1000);
    });
  });

  describe('useExpenses', () => {
    it('should use ApiClient.get with filters as params', async () => {
      const { useExpenses } = require('@/hooks/expenses/useExpenses');
      const filters = {
        restaurantId: 'rest-1',
        startDate: '2025-01-01',
        categoryId: 'cat-1',
      };

      const config = getQueryConfig(useExpenses, filters);

      // Verify centralized key
      expect(config.queryKey[0]).toBe('expenses');
      expect(config.queryKey[1]).toBe('list');

      // Verify queryFn calls ApiClient.get
      await config.queryFn();
      expect(ApiClient.get).toHaveBeenCalledWith(
        '/api/admin/expenses',
        expect.objectContaining({
          params: expect.objectContaining({
            restaurantId: 'rest-1',
            startDate: '2025-01-01',
            categoryId: 'cat-1',
          }),
        })
      );
    });

    it('should exclude empty/undefined filter values from params', async () => {
      const { useExpenses } = require('@/hooks/expenses/useExpenses');
      const filters = {
        restaurantId: 'rest-1',
        search: '',
        categoryId: undefined,
      };

      const config = getQueryConfig(useExpenses, filters);
      await config.queryFn();

      const passedParams = (ApiClient.get as jest.Mock).mock.calls[0][1].params;
      expect(passedParams.restaurantId).toBe('rest-1');
      expect(passedParams).not.toHaveProperty('search');
      expect(passedParams).not.toHaveProperty('categoryId');
    });

    it('should be disabled when restaurantId is empty', () => {
      const { useExpenses } = require('@/hooks/expenses/useExpenses');
      const config = getQueryConfig(useExpenses, { restaurantId: '' });
      expect(config.enabled).toBe(false);
    });
  });

  describe('useCategories', () => {
    it('should use ApiClient.get with restaurantId param', async () => {
      const { useCategories } = require('@/hooks/expenses/useCategories');
      const config = getQueryConfig(useCategories, 'rest-1');

      expect(config.queryKey).toEqual(queryKeys.expenses.categories('rest-1'));

      await config.queryFn();
      expect(ApiClient.get).toHaveBeenCalledWith(
        '/api/admin/expenses/categories',
        { params: { restaurantId: 'rest-1' } }
      );
    });

    it('should have Infinity stale time (categories rarely change)', () => {
      const { useCategories } = require('@/hooks/expenses/useCategories');
      const config = getQueryConfig(useCategories, 'rest-1');
      expect(config.staleTime).toBe(Infinity);
    });
  });

  describe('useProfitLoss', () => {
    it('should use ApiClient.get with correct endpoint and params', async () => {
      const { useProfitLoss } = require('@/hooks/reports/useProfitLoss');
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      const config = getQueryConfig(useProfitLoss, {
        restaurantId: 'rest-1',
        startDate: start,
        endDate: end,
      });

      expect(config.queryKey).toEqual(
        queryKeys.profitLoss.report({
          restaurantId: 'rest-1',
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        })
      );

      await config.queryFn();
      expect(ApiClient.get).toHaveBeenCalledWith(
        '/api/admin/reports/profit-loss',
        {
          params: {
            restaurantId: 'rest-1',
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          },
        }
      );
    });

    it('should have 30 minute stale time and 1 hour gc time', () => {
      const { useProfitLoss } = require('@/hooks/reports/useProfitLoss');
      const config = getQueryConfig(useProfitLoss, {
        restaurantId: 'rest-1',
        startDate: new Date(),
        endDate: new Date(),
      });
      expect(config.staleTime).toBe(30 * 60 * 1000);
      expect(config.gcTime).toBe(60 * 60 * 1000);
      expect(config.refetchOnWindowFocus).toBe(false);
    });
  });
});

// ============================================================================
// Tests: Mutation Hooks (POST, PUT, DELETE)
// ============================================================================

describe('Expense Mutation Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useCreateExpense', () => {
    it('should use ApiClient.post to /api/admin/expenses', async () => {
      const { useCreateExpense } = require('@/hooks/expenses/useCreateExpense');
      const config = getMutationConfig(useCreateExpense);

      const expenseData = {
        restaurantId: 'rest-1',
        categoryId: 'cat-1',
        amount: 99.99,
        description: 'Test expense',
        expenseDate: '2025-01-15T00:00:00.000Z',
        paymentMethod: 'CASH',
      };

      await config.mutationFn(expenseData);
      expect(ApiClient.post).toHaveBeenCalledWith(
        '/api/admin/expenses',
        expenseData
      );
    });

    it('should invalidate expenses.all on success', () => {
      const { useCreateExpense } = require('@/hooks/expenses/useCreateExpense');
      const config = getMutationConfig(useCreateExpense);

      config.onSuccess();

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.expenses.all,
      });
    });

    it('should show success toast on create', () => {
      const { toast } = require('sonner');
      const { useCreateExpense } = require('@/hooks/expenses/useCreateExpense');
      const config = getMutationConfig(useCreateExpense);

      config.onSuccess();
      expect(toast.success).toHaveBeenCalledWith('Expense added successfully');
    });

    it('should show error toast on failure', () => {
      const { toast } = require('sonner');
      const { useCreateExpense } = require('@/hooks/expenses/useCreateExpense');
      const config = getMutationConfig(useCreateExpense);

      config.onError(new Error('Network error'));
      expect(toast.error).toHaveBeenCalledWith('Network error');
    });
  });

  describe('useUpdateExpense', () => {
    it('should use ApiClient.put to /api/admin/expenses/:id', async () => {
      const { useUpdateExpense } = require('@/hooks/expenses/useUpdateExpense');
      const config = getMutationConfig(useUpdateExpense, 'expense-123');

      const updateData = { amount: 150, description: 'Updated' };
      await config.mutationFn(updateData);

      expect(ApiClient.put).toHaveBeenCalledWith(
        '/api/admin/expenses/expense-123',
        updateData
      );
    });

    it('should invalidate expenses.all on success', () => {
      const { useUpdateExpense } = require('@/hooks/expenses/useUpdateExpense');
      const config = getMutationConfig(useUpdateExpense, 'expense-123');

      config.onSuccess();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.expenses.all,
      });
    });
  });

  describe('useDeleteExpense', () => {
    it('should use ApiClient.delete to /api/admin/expenses/:id', async () => {
      const { useDeleteExpense } = require('@/hooks/expenses/useDeleteExpense');
      const config = getMutationConfig(useDeleteExpense);

      await config.mutationFn('expense-456');
      expect(ApiClient.delete).toHaveBeenCalledWith(
        '/api/admin/expenses/expense-456'
      );
    });

    it('should invalidate expenses.all on success', () => {
      const { useDeleteExpense } = require('@/hooks/expenses/useDeleteExpense');
      const config = getMutationConfig(useDeleteExpense);

      config.onSuccess();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.expenses.all,
      });
    });
  });

  describe('useCreateCategory', () => {
    it('should use ApiClient.post to /api/admin/expenses/categories', async () => {
      const {
        useCreateCategory,
      } = require('@/hooks/expenses/useCreateCategory');
      const config = getMutationConfig(useCreateCategory);

      const categoryData = {
        restaurantId: 'rest-1',
        name: 'Marketing',
        categoryType: 'OPERATING',
      };

      await config.mutationFn(categoryData);
      expect(ApiClient.post).toHaveBeenCalledWith(
        '/api/admin/expenses/categories',
        categoryData
      );
    });

    it('should invalidate restaurant-specific categories on success', () => {
      const {
        useCreateCategory,
      } = require('@/hooks/expenses/useCreateCategory');
      const config = getMutationConfig(useCreateCategory);

      config.onSuccess(
        {},
        { restaurantId: 'rest-1', name: 'Test', categoryType: 'COGS' }
      );

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.expenses.categories('rest-1'),
      });
    });
  });

  describe('useDeleteCategory', () => {
    it('should use ApiClient.delete to /api/admin/expenses/categories/:id', async () => {
      const {
        useDeleteCategory,
      } = require('@/hooks/expenses/useDeleteCategory');
      const config = getMutationConfig(useDeleteCategory);

      await config.mutationFn('cat-789');
      expect(ApiClient.delete).toHaveBeenCalledWith(
        '/api/admin/expenses/categories/cat-789'
      );
    });

    it('should invalidate restaurant-specific categories on success', () => {
      const {
        useDeleteCategory,
      } = require('@/hooks/expenses/useDeleteCategory');
      const config = getMutationConfig(useDeleteCategory);

      config.onSuccess({ restaurantId: 'rest-1' });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.expenses.categories('rest-1'),
      });
    });
  });
});
