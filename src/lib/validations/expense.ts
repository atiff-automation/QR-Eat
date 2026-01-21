import { z } from 'zod';

// ============================================================================
// Expense Validation Schema
// ============================================================================

export const createExpenseSchema = z.object({
  restaurantId: z.string().uuid('Invalid restaurant ID'),
  categoryId: z.string().uuid('Please select a category'),
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(999999.99, 'Amount is too large'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description is too long')
    .trim(),
  expenseDate: z.date(),
  vendor: z.string().max(200, 'Vendor name is too long').optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'EWALLET']),
  invoiceNumber: z.string().max(100, 'Invoice number is too long').optional(),
  notes: z.string().max(1000, 'Notes are too long').optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial().omit({
  restaurantId: true,
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

// ============================================================================
// Category Validation Schema
// ============================================================================

export const createCategorySchema = z.object({
  restaurantId: z.string().uuid('Invalid restaurant ID'),
  name: z
    .string()
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name is too long')
    .trim(),
  description: z.string().max(500, 'Description is too long').optional(),
  categoryType: z.enum(['COGS', 'OPERATING', 'OTHER']),
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .omit({ restaurantId: true, categoryType: true });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ============================================================================
// Filter Schemas
// ============================================================================

export const expenseFiltersSchema = z.object({
  restaurantId: z.string().uuid(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;

export const profitLossParamsSchema = z.object({
  restaurantId: z.string().uuid(),
  startDate: z.date(),
  endDate: z.date(),
});

export type ProfitLossParams = z.infer<typeof profitLossParamsSchema>;
