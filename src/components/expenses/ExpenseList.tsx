'use client';

import React from 'react';
import { ExpenseCard } from './ExpenseCard';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Receipt } from 'lucide-react';

interface Expense {
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
}

interface ExpenseListProps {
  expenses: Expense[];
  isLoading: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => void;
}

export function ExpenseList({
  expenses,
  isLoading,
  onEdit,
  onDelete,
}: ExpenseListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 mb-3">
          <Receipt className="w-6 h-6 text-gray-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          No expenses found
        </h3>
        <p className="text-sm text-gray-500">Tap + to add your first expense</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {expenses.map((expense) => (
        <ExpenseCard
          key={expense.id}
          expense={expense}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
