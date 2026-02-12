'use client';

import React from 'react';
import { format } from 'date-fns';
import { Edit2, Trash2, MoreVertical } from 'lucide-react';
import { CategoryBadge } from './CategoryBadge';
import { useCurrency } from '@/lib/hooks/queries/useRestaurantSettings';
import { formatCurrency } from '@/lib/utils/currency-formatter';

interface ExpenseCardProps {
  expense: {
    id: string;
    amount: number;
    description: string;
    expenseDate: string;
    vendor: string | null;
    paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EWALLET';
    category: {
      id: string;
      name: string;
      categoryType: 'COGS' | 'OPERATING' | 'OTHER';
    };
  };
  onEdit: (expense: ExpenseCardProps['expense']) => void;
  onDelete: (expenseId: string) => void;
}

const paymentMethodLabels = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer',
  EWALLET: 'E-Wallet',
};

export function ExpenseCard({ expense, onEdit, onDelete }: ExpenseCardProps) {
  const currency = useCurrency();
  const [showActions, setShowActions] = React.useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      {/* Header - Date and Amount */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-sm text-gray-500">
            {format(new Date(expense.expenseDate), 'MMM dd, yyyy')}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(expense.amount, currency)}
          </p>
        </div>

        {/* Actions Menu - Mobile Optimized */}
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Actions"
          >
            <MoreVertical size={20} className="text-gray-600" />
          </button>

          {showActions && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowActions(false)}
              />

              {/* Actions Menu */}
              <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                <button
                  onClick={() => {
                    onEdit(expense);
                    setShowActions(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Edit2 size={16} />
                  Edit
                </button>
                <button
                  onClick={() => {
                    onDelete(expense.id);
                    setShowActions(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Category Badge */}
      <div className="mb-3">
        <CategoryBadge
          categoryName={expense.category.name}
          categoryType={expense.category.categoryType}
        />
      </div>

      {/* Description */}
      <p className="text-gray-900 font-medium mb-2">{expense.description}</p>

      {/* Vendor and Payment Method */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        {expense.vendor && (
          <span className="flex items-center gap-1">
            <span className="font-medium">Vendor:</span> {expense.vendor}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="font-medium">Payment:</span>{' '}
          {paymentMethodLabels[expense.paymentMethod]}
        </span>
      </div>
    </div>
  );
}
