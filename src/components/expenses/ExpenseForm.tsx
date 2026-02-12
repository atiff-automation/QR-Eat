'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { DateInput } from '@/components/ui/DateInput';
import { useCategories } from '@/hooks/expenses/useCategories';
import { useCreateExpense } from '@/hooks/expenses/useCreateExpense';
import { useUpdateExpense } from '@/hooks/expenses/useUpdateExpense';
import { useCurrency } from '@/lib/hooks/queries/useRestaurantSettings';
import { createExpenseSchema } from '@/lib/validations/expense';
import { z } from 'zod';

interface ExpenseFormProps {
  restaurantId: string;
  expense?: {
    id: string;
    categoryId: string;
    amount: number;
    description: string;
    expenseDate: string;
    vendor: string | null;
    paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EWALLET';
    invoiceNumber: string | null;
    notes: string | null;
  };
  onSuccess: () => void;
  onCancel: () => void;
}

type FormData = z.infer<typeof createExpenseSchema>;

// Extract YYYY-MM-DD from an ISO string without timezone conversion
function toDateString(isoOrDate: string | Date): string {
  const s = typeof isoOrDate === 'string' ? isoOrDate : isoOrDate.toISOString();
  return s.slice(0, 10);
}

// Get today as YYYY-MM-DD in local timezone
function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function ExpenseForm({
  restaurantId,
  expense,
  onSuccess,
  onCancel,
}: ExpenseFormProps) {
  const [showOptional, setShowOptional] = React.useState(
    !!(expense?.vendor || expense?.invoiceNumber || expense?.notes)
  );
  const isEditMode = !!expense;

  const currency = useCurrency();
  const { data: categoriesData } = useCategories(restaurantId);
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense(expense?.id || '');

  const defaultValues: Partial<FormData> =
    isEditMode && expense
      ? {
          restaurantId,
          categoryId: expense.categoryId,
          amount: Number(expense.amount),
          description: expense.description,
          expenseDate: toDateString(expense.expenseDate),
          vendor: expense.vendor || undefined,
          paymentMethod: expense.paymentMethod,
          invoiceNumber: expense.invoiceNumber || undefined,
          notes: expense.notes || undefined,
        }
      : {
          restaurantId,
          expenseDate: todayString(),
          paymentMethod: 'CASH',
        };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    clearErrors,
  } = useForm<FormData>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const amount = watch('amount') || 0;

  const onSubmit = async (data: FormData) => {
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync({
          categoryId: data.categoryId,
          amount: data.amount,
          description: data.description,
          expenseDate: data.expenseDate,
          vendor: data.vendor || null,
          paymentMethod: data.paymentMethod,
          invoiceNumber: data.invoiceNumber || null,
          notes: data.notes || null,
        });
      } else {
        await createMutation.mutateAsync({
          restaurantId: data.restaurantId,
          categoryId: data.categoryId,
          amount: data.amount,
          description: data.description,
          expenseDate: data.expenseDate,
          vendor: data.vendor,
          paymentMethod: data.paymentMethod,
          invoiceNumber: data.invoiceNumber,
          notes: data.notes,
        });
      }
      onSuccess();
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const categoryGroups = categoriesData
    ? {
        COGS: categoriesData.categories.COGS,
        OPERATING: categoriesData.categories.OPERATING,
        OTHER: categoriesData.categories.OTHER,
      }
    : null;

  const handleFormSubmit = handleSubmit(onSubmit);

  return (
    <form onSubmit={handleFormSubmit} className="flex flex-col h-full">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Amount Input — promoted to top */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Amount <span className="text-red-500">*</span>
          </label>
          <CurrencyInput
            value={amount}
            onChange={(value) => setValue('amount', value)}
            currency={currency}
            className={`w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-lg font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white ${
              errors.amount ? 'border-red-400' : 'border-gray-200'
            }`}
            placeholder="0.00"
            required
          />
          {errors.amount && (
            <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>
          )}
        </div>

        {/* Category Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            {...register('categoryId', {
              onChange: (e) => {
                if (e.target.value) {
                  clearErrors('categoryId');
                }
              },
            })}
            className={`w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white ${
              errors.categoryId ? 'border-red-400' : 'border-gray-200'
            }`}
          >
            <option value="">Select a category</option>
            {categoryGroups && (
              <>
                <optgroup label="Cost of Goods Sold (COGS)">
                  {categoryGroups.COGS.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Operating Expenses">
                  {categoryGroups.OPERATING.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Other Expenses">
                  {categoryGroups.OTHER.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </optgroup>
              </>
            )}
          </select>
          {errors.categoryId && (
            <p className="mt-1 text-xs text-red-600">
              {errors.categoryId.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            {...register('description')}
            rows={2}
            className={`w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white resize-none ${
              errors.description ? 'border-red-400' : 'border-gray-200'
            }`}
            placeholder="What was this expense for?"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-600">
              {errors.description.message}
            </p>
          )}
        </div>

        {/* Date + Payment Method — side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Date <span className="text-red-500">*</span>
            </label>
            <DateInput
              value={watch('expenseDate') || ''}
              onChange={(val) => setValue('expenseDate', val)}
              maxDate={new Date()}
              className={`px-3 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white ${
                errors.expenseDate ? 'border-red-400' : 'border-gray-200'
              }`}
            />
            {errors.expenseDate && (
              <p className="mt-1 text-xs text-red-600">
                {errors.expenseDate.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Payment <span className="text-red-500">*</span>
            </label>
            <select
              {...register('paymentMethod')}
              className={`w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white ${
                errors.paymentMethod ? 'border-red-400' : 'border-gray-200'
              }`}
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="EWALLET">E-Wallet</option>
            </select>
            {errors.paymentMethod && (
              <p className="mt-1 text-xs text-red-600">
                {errors.paymentMethod.message}
              </p>
            )}
          </div>
        </div>

        {/* Optional Fields Toggle */}
        {!showOptional ? (
          <button
            type="button"
            onClick={() => setShowOptional(true)}
            className="text-sm text-green-600 font-medium hover:text-green-700"
          >
            + Add vendor, invoice, notes
          </button>
        ) : (
          <div className="space-y-3 pt-1">
            {/* Vendor */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Vendor
              </label>
              <input
                type="text"
                {...register('vendor')}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white"
                placeholder="Supplier or vendor name"
              />
            </div>

            {/* Invoice Number */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Invoice Number
              </label>
              <input
                type="text"
                {...register('invoiceNumber')}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white"
                placeholder="INV-001"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Notes
              </label>
              <textarea
                {...register('notes')}
                rows={2}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent focus:bg-white resize-none"
                placeholder="Additional notes..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <div className="border-t border-gray-100 p-4 bg-white flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 active:bg-gray-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-3 text-white bg-green-600 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 active:bg-green-800"
        >
          {isSubmitting ? 'Saving...' : isEditMode ? 'Update' : 'Save'}
        </button>
      </div>
    </form>
  );
}
