'use client';

import React from 'react';
import { Plus, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/expenses/useExpenses';
import { useDeleteExpense } from '@/hooks/expenses/useDeleteExpense';
import { ExpenseSummaryCards } from '@/components/expenses/ExpenseSummaryCards';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { ExpenseFormModal } from '@/components/expenses/ExpenseFormModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Expenses | QR-Eat',
  description: 'Manage restaurant expenses and track spending',
};

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

export default function ExpensesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [showExpenseForm, setShowExpenseForm] = React.useState(false);
  const [selectedExpense, setSelectedExpense] = React.useState<Expense | null>(
    null
  );
  const [showCategoryManager, setShowCategoryManager] = React.useState(false);

  // Filter state
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [filters, setFilters] = React.useState<{
    startDate?: Date;
    endDate?: Date;
    categoryId?: string;
    search?: string;
  }>({
    startDate: startOfMonth,
    endDate: now,
    categoryId: undefined,
    search: undefined,
  });

  const restaurantId = user?.restaurantId || '';

  // Fetch expenses with current filters
  const { data: expensesData, isLoading: expensesLoading } = useExpenses({
    restaurantId,
    startDate: filters.startDate?.toISOString(),
    endDate: filters.endDate?.toISOString(),
    categoryId: filters.categoryId,
    search: filters.search,
    page: 1,
    limit: 50,
  });

  const deleteMutation = useDeleteExpense();

  // Handle authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user || !restaurantId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600">
            You must be logged in to view this page.
          </p>
        </div>
      </div>
    );
  }

  const handleAddExpense = () => {
    setSelectedExpense(null);
    setShowExpenseForm(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowExpenseForm(true);
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      await deleteMutation.mutateAsync(expenseId);
    }
  };

  const handleFormSuccess = () => {
    setShowExpenseForm(false);
    setSelectedExpense(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCategoryManager(true)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors flex items-center gap-2"
              >
                <Settings size={18} />
                <span className="hidden sm:inline">Categories</span>
              </button>
              <button
                onClick={handleAddExpense}
                className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
              >
                <Plus size={18} />
                Add Expense
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Summary Cards */}
        <ExpenseSummaryCards
          restaurantId={restaurantId}
          startDate={filters.startDate || startOfMonth}
          endDate={filters.endDate || now}
        />

        {/* Filters */}
        <ExpenseFilters
          restaurantId={restaurantId}
          filters={filters}
          onFiltersChange={setFilters}
        />

        {/* Expense List */}
        <div className="mt-6">
          <ExpenseList
            expenses={expensesData?.expenses || []}
            isLoading={expensesLoading}
            onEdit={handleEditExpense}
            onDelete={handleDeleteExpense}
          />
        </div>

        {/* Pagination Info */}
        {expensesData && expensesData.expenses.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Showing {expensesData.expenses.length} of{' '}
            {expensesData.pagination.totalCount} expenses
          </div>
        )}
      </div>

      {/* Expense Form Modal */}
      <ExpenseFormModal
        isOpen={showExpenseForm}
        onClose={() => setShowExpenseForm(false)}
        restaurantId={restaurantId}
        expense={
          selectedExpense
            ? {
                id: selectedExpense.id,
                categoryId: selectedExpense.categoryId,
                amount: selectedExpense.amount,
                description: selectedExpense.description,
                expenseDate: selectedExpense.expenseDate,
                vendor: selectedExpense.vendor,
                paymentMethod: selectedExpense.paymentMethod,
                invoiceNumber: selectedExpense.invoiceNumber,
                notes: selectedExpense.notes,
              }
            : undefined
        }
        onSuccess={handleFormSuccess}
      />

      {/* Category Manager Modal - TODO: Implement in next phase */}
      {showCategoryManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Category Manager</h2>
            <p className="text-gray-600 mb-4">
              Category management will be implemented in the next phase.
            </p>
            <button
              onClick={() => setShowCategoryManager(false)}
              className="w-full px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
