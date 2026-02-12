/**
 * Test Suite: Expense Validation Schemas
 *
 * Covers all edge cases for the expense validation schemas that were fixed:
 * - categoryId accepts non-UUID strings (e.g., 'system-cogs-food')
 * - expenseDate accepts YYYY-MM-DD strings (not Date objects)
 * - amount must be a number (not string from Prisma Decimal)
 * - paymentMethod enum validation
 * - Optional field constraints
 * - expenseFiltersSchema categoryId accepts non-UUID strings
 */

import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseFiltersSchema,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  profitLossParamsSchema,
} from '@/lib/validations/expense';

// ============================================================================
// Test Data
// ============================================================================

const VALID_RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440000';

const validExpense = {
  restaurantId: VALID_RESTAURANT_ID,
  categoryId: 'system-cogs-food',
  amount: 150.5,
  description: 'Weekly food supplies',
  expenseDate: '2026-02-12',
  paymentMethod: 'CASH' as const,
};

// ============================================================================
// createExpenseSchema Tests
// ============================================================================

describe('createExpenseSchema', () => {
  describe('valid inputs', () => {
    it('accepts a complete valid expense with non-UUID categoryId', () => {
      const result = createExpenseSchema.safeParse(validExpense);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.categoryId).toBe('system-cogs-food');
      }
    });

    it('accepts system category IDs like "system-cogs-food"', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        categoryId: 'system-cogs-food',
      });
      expect(result.success).toBe(true);
    });

    it('accepts system category IDs like "system-operating-rent"', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        categoryId: 'system-operating-rent',
      });
      expect(result.success).toBe(true);
    });

    it('accepts UUID-format category IDs', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        categoryId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('accepts YYYY-MM-DD date string for expenseDate', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        expenseDate: '2026-01-15',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expenseDate).toBe('2026-01-15');
      }
    });

    it('accepts numeric amount (not string)', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        amount: 99.99,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.amount).toBe('number');
      }
    });

    it('accepts all valid payment methods', () => {
      const methods = ['CASH', 'CARD', 'BANK_TRANSFER', 'EWALLET'] as const;
      for (const method of methods) {
        const result = createExpenseSchema.safeParse({
          ...validExpense,
          paymentMethod: method,
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts expense with all optional fields', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        vendor: 'ABC Supplies',
        invoiceNumber: 'INV-001',
        notes: 'Paid in full',
      });
      expect(result.success).toBe(true);
    });

    it('accepts expense without optional fields', () => {
      const result = createExpenseSchema.safeParse(validExpense);
      expect(result.success).toBe(true);
    });
  });

  describe('categoryId validation', () => {
    it('rejects empty string categoryId with descriptive message', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        categoryId: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const categoryError = result.error.issues.find(
          (i) => i.path[0] === 'categoryId'
        );
        expect(categoryError?.message).toBe('Please select a category');
      }
    });

    it('rejects missing categoryId', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { categoryId: _categoryId, ...withoutCategory } = validExpense;
      const result = createExpenseSchema.safeParse(withoutCategory);
      expect(result.success).toBe(false);
    });

    it('does NOT require categoryId to be a UUID', () => {
      // This was the original bug — system categories use non-UUID IDs
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        categoryId: 'system-other-misc',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('amount validation', () => {
    it('rejects string amount (Prisma Decimal serialization bug)', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        amount: '150.50', // Prisma Decimal serializes as string
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const amountError = result.error.issues.find(
          (i) => i.path[0] === 'amount'
        );
        expect(amountError).toBeDefined();
      }
    });

    it('rejects zero amount', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        amount: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative amount', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        amount: -50,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find((i) => i.path[0] === 'amount');
        expect(err?.message).toBe('Amount must be positive');
      }
    });

    it('rejects amount exceeding maximum', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        amount: 1000000,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find((i) => i.path[0] === 'amount');
        expect(err?.message).toBe('Amount is too large');
      }
    });

    it('accepts boundary amount of 999999.99', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        amount: 999999.99,
      });
      expect(result.success).toBe(true);
    });

    it('accepts small positive amount', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        amount: 0.01,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('expenseDate validation', () => {
    it('accepts valid YYYY-MM-DD date string', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        expenseDate: '2026-02-12',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty date string', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        expenseDate: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find(
          (i) => i.path[0] === 'expenseDate'
        );
        expect(err?.message).toBe('Date is required');
      }
    });

    it('rejects missing expenseDate', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { expenseDate: _expenseDate, ...withoutDate } = validExpense;
      const result = createExpenseSchema.safeParse(withoutDate);
      expect(result.success).toBe(false);
    });

    it('preserves date string as-is (no timezone conversion)', () => {
      const dateStr = '2026-02-28';
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        expenseDate: dateStr,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expenseDate).toBe(dateStr);
      }
    });
  });

  describe('description validation', () => {
    it('rejects empty description', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        description: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find(
          (i) => i.path[0] === 'description'
        );
        expect(err?.message).toBe('Description is required');
      }
    });

    it('rejects description exceeding 500 chars', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        description: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find(
          (i) => i.path[0] === 'description'
        );
        expect(err?.message).toBe('Description is too long');
      }
    });

    it('trims whitespace from description', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        description: '  Weekly supplies  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('Weekly supplies');
      }
    });
  });

  describe('restaurantId validation', () => {
    it('requires restaurantId to be a valid UUID', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        restaurantId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find(
          (i) => i.path[0] === 'restaurantId'
        );
        expect(err?.message).toBe('Invalid restaurant ID');
      }
    });
  });

  describe('paymentMethod validation', () => {
    it('rejects invalid payment method', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        paymentMethod: 'BITCOIN',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('optional field constraints', () => {
    it('rejects vendor name exceeding 200 chars', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        vendor: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find((i) => i.path[0] === 'vendor');
        expect(err?.message).toBe('Vendor name is too long');
      }
    });

    it('rejects invoice number exceeding 100 chars', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        invoiceNumber: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('rejects notes exceeding 1000 chars', () => {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        notes: 'a'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// updateExpenseSchema Tests
// ============================================================================

describe('updateExpenseSchema', () => {
  it('allows partial updates (all fields optional)', () => {
    const result = updateExpenseSchema.safeParse({
      amount: 200,
    });
    expect(result.success).toBe(true);
  });

  it('does not include restaurantId', () => {
    const result = updateExpenseSchema.safeParse({
      restaurantId: VALID_RESTAURANT_ID,
    });
    // restaurantId should be stripped (omitted from schema)
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('restaurantId');
    }
  });

  it('accepts non-UUID categoryId in updates', () => {
    const result = updateExpenseSchema.safeParse({
      categoryId: 'system-operating-utilities',
    });
    expect(result.success).toBe(true);
  });

  it('accepts string date in updates', () => {
    const result = updateExpenseSchema.safeParse({
      expenseDate: '2026-02-10',
    });
    expect(result.success).toBe(true);
  });

  it('rejects string amount in updates', () => {
    const result = updateExpenseSchema.safeParse({
      amount: '150.50',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// expenseFiltersSchema Tests
// ============================================================================

describe('expenseFiltersSchema', () => {
  it('accepts non-UUID categoryId in filters', () => {
    const result = expenseFiltersSchema.safeParse({
      restaurantId: VALID_RESTAURANT_ID,
      categoryId: 'system-cogs-food',
    });
    expect(result.success).toBe(true);
  });

  it('accepts filters without optional categoryId', () => {
    const result = expenseFiltersSchema.safeParse({
      restaurantId: VALID_RESTAURANT_ID,
    });
    expect(result.success).toBe(true);
  });

  it('requires restaurantId to be a UUID', () => {
    const result = expenseFiltersSchema.safeParse({
      restaurantId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string categoryId in filters', () => {
    const result = expenseFiltersSchema.safeParse({
      restaurantId: VALID_RESTAURANT_ID,
      categoryId: '',
    });
    expect(result.success).toBe(false);
  });

  it('provides default page and limit values', () => {
    const result = expenseFiltersSchema.safeParse({
      restaurantId: VALID_RESTAURANT_ID,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit exceeding 100', () => {
    const result = expenseFiltersSchema.safeParse({
      restaurantId: VALID_RESTAURANT_ID,
      limit: 101,
    });
    expect(result.success).toBe(false);
  });
});
