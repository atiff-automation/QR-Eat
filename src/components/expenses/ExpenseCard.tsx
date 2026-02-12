'use client';

import React from 'react';
import { format, parseISO } from 'date-fns';
import { Edit2, Trash2, MoreVertical } from 'lucide-react';
import { useCurrency } from '@/lib/hooks/queries/useRestaurantSettings';
import { formatCurrency } from '@/lib/utils/currency-formatter';

interface ExpenseCardProps {
  expense: {
    id: string;
    categoryId: string;
    amount: number;
    description: string;
    expenseDate: string;
    vendor: string | null;
    paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EWALLET';
    invoiceNumber: string | null;
    notes: string | null;
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
  BANK_TRANSFER: 'Bank',
  EWALLET: 'E-Wallet',
};

const categoryDotColors = {
  COGS: 'bg-orange-400',
  OPERATING: 'bg-blue-400',
  OTHER: 'bg-gray-400',
};

export function ExpenseCard({ expense, onEdit, onDelete }: ExpenseCardProps) {
  const currency = useCurrency();
  const [showActions, setShowActions] = React.useState(false);

  const descriptionWithVendor = expense.vendor
    ? `${expense.description} — ${expense.vendor}`
    : expense.description;

  return (
    <div className="bg-white rounded-xl border border-gray-100 px-3.5 py-3 hover:shadow-sm transition-shadow active:bg-gray-50">
      <div className="flex items-center gap-3">
        {/* Category Dot */}
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${categoryDotColors[expense.category.categoryType]}`}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {descriptionWithVendor}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-gray-400">
              {format(parseISO(expense.expenseDate), 'MMM d')}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">
              {paymentMethodLabels[expense.paymentMethod]}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">
              {expense.category.name}
            </span>
          </div>
        </div>

        {/* Amount */}
        <span className="text-sm font-semibold text-gray-900 flex-shrink-0">
          {formatCurrency(expense.amount, currency)}
        </span>

        {/* Actions */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-1.5 -mr-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Actions"
          >
            <MoreVertical size={16} className="text-gray-400" />
          </button>

          {showActions && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowActions(false)}
              />
              <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                <button
                  onClick={() => {
                    onEdit(expense);
                    setShowActions(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                >
                  <Edit2 size={14} />
                  Edit
                </button>
                <button
                  onClick={() => {
                    onDelete(expense.id);
                    setShowActions(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 hover:bg-red-50 active:bg-red-100"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
