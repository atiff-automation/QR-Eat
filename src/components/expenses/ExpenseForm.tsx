'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { useCategories } from '@/hooks/expenses/useCategories';
import { useCreateExpense } from '@/hooks/expenses/useCreateExpense';
import { useUpdateExpense } from '@/hooks/expenses/useUpdateExpense';
import { useCurrency } from '@/lib/hooks/queries/useRestaurantSettings';
import {
  createExpenseSchema,
  updateExpenseSchema,
} from '@/lib/validations/expense';
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

export function ExpenseForm({
  restaurantId,
  expense,
  onSuccess,
  onCancel,
}: ExpenseFormProps) {
  const [showNotes, setShowNotes] = React.useState(!!expense?.notes);
  const isEditMode = !!expense;

  const currency = useCurrency();
  const { data: categoriesData } = useCategories(restaurantId);
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense(expense?.id || '');

  // Prepare default values
  const defaultValues: Partial<FormData> =
    isEditMode && expense
      ? {
          restaurantId,
          categoryId: expense.categoryId,
          amount: expense.amount,
          description: expense.description,
          expenseDate: new Date(expense.expenseDate),
          vendor: expense.vendor || undefined,
          paymentMethod: expense.paymentMethod,
          invoiceNumber: expense.invoiceNumber || undefined,
          notes: expense.notes || undefined,
        }
      : {
          restaurantId,
          expenseDate: new Date(),
          paymentMethod: 'CASH',
        };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(
      isEditMode ? updateExpenseSchema : createExpenseSchema
    ),
    defaultValues,
  });

  const amount = watch('amount') || 0;

  const onSubmit = async (data: FormData) => {
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync({
          categoryId: data.categoryId,
          amount: data.amount,
          description: data.description,
          expenseDate: data.expenseDate.toISOString(),
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
          expenseDate: data.expenseDate.toISOString(),
          vendor: data.vendor,
          paymentMethod: data.paymentMethod,
          invoiceNumber: data.invoiceNumber,
          notes: data.notes,
        });
      }
      onSuccess();
    } catch (error) {
      // Error handling is done in the mutation hooks
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Category Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            {...register('categoryId')}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
              errors.categoryId ? 'border-red-500' : 'border-gray-300'
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
            <p className="mt-1 text-sm text-red-600">
              {errors.categoryId.message}
            </p>
          )}
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount <span className="text-red-500">*</span>
          </label>
          <CurrencyInput
            value={amount}
            onChange={(value) => setValue('amount', value)}
            currency={currency}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
              errors.amount ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="0.00"
            required
          />
          {errors.amount && (
            <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
          )}
        </div>

        {/* Date Picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            {...register('expenseDate', {
              setValueAs: (value) => (value ? new Date(value) : undefined),
            })}
            max={new Date().toISOString().split('T')[0]}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
              errors.expenseDate ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.expenseDate && (
            <p className="mt-1 text-sm text-red-600">
              {errors.expenseDate.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            {...register('description')}
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none ${
              errors.description ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="What was this expense for?"
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">
              {errors.description.message}
            </p>
          )}
        </div>

        {/* Vendor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Vendor (Optional)
          </label>
          <input
            type="text"
            {...register('vendor')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Supplier or vendor name"
          />
          {errors.vendor && (
            <p className="mt-1 text-sm text-red-600">{errors.vendor.message}</p>
          )}
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Method <span className="text-red-500">*</span>
          </label>
          <select
            {...register('paymentMethod')}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
              errors.paymentMethod ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="EWALLET">E-Wallet</option>
          </select>
          {errors.paymentMethod && (
            <p className="mt-1 text-sm text-red-600">
              {errors.paymentMethod.message}
            </p>
          )}
        </div>

        {/* Invoice Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice Number (Optional)
          </label>
          <input
            type="text"
            {...register('invoiceNumber')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="INV-001"
          />
          {errors.invoiceNumber && (
            <p className="mt-1 text-sm text-red-600">
              {errors.invoiceNumber.message}
            </p>
          )}
        </div>

        {/* Notes (Collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1 hover:text-gray-900"
          >
            Notes (Optional)
            {showNotes ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showNotes && (
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              placeholder="Additional notes or details..."
            />
          )}
          {errors.notes && (
            <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
          )}
        </div>
      </div>

      {/* Sticky Footer with Buttons */}
      <div className="border-t border-gray-200 p-4 bg-white flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-3 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving...' : isEditMode ? 'Update' : 'Save'}
        </button>
      </div>
    </form>
  );
}
