'use client';

import React from 'react';
import { Plus, Settings } from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { useExpenses } from '@/hooks/expenses/useExpenses';
import { useDeleteExpense } from '@/hooks/expenses/useDeleteExpense';
import { ExpenseSummaryCards } from '@/components/expenses/ExpenseSummaryCards';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { ExpenseFormModal } from '@/components/expenses/ExpenseFormModal';
import { CategoryManager } from '@/components/expenses/CategoryManager';
import { getDateRange } from '@/lib/date-utils';

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
  const { user, restaurantContext, isLoading } = useRole();
  const [showExpenseForm, setShowExpenseForm] = React.useState(false);
  const [selectedExpense, setSelectedExpense] = React.useState<Expense | null>(
    null
  );
  const [showCategoryManager, setShowCategoryManager] = React.useState(false);

  // Filter state — default to current month
  const defaultRange = getDateRange('month');
  const [filters, setFilters] = React.useState<{
    startDate?: Date;
    endDate?: Date;
    categoryId?: string;
    search?: string;
  }>({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    categoryId: undefined,
    search: undefined,
  });

  const restaurantId = restaurantContext?.id || '';

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

  // RoleProvider already handles auth loading and redirects to login
  if (isLoading || !user || !restaurantId) {
    return null;
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
    <div className="min-h-screen bg-gray-50/80">
      {/* Main Content */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Settings shortcut */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setShowCategoryManager(true)}
            className="p-2 -mr-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            title="Manage categories"
          >
            <Settings size={18} />
          </button>
        </div>

        {/* Summary Cards */}
        <ExpenseSummaryCards
          restaurantId={restaurantId}
          startDate={filters.startDate || defaultRange.startDate}
          endDate={filters.endDate || defaultRange.endDate}
        />

        {/* Filters */}
        <ExpenseFilters
          restaurantId={restaurantId}
          filters={filters}
          onFiltersChange={setFilters}
        />

        {/* Expense List */}
        <div className="mt-4">
          <ExpenseList
            expenses={expensesData?.expenses || []}
            isLoading={expensesLoading}
            onEdit={handleEditExpense}
            onDelete={handleDeleteExpense}
          />
        </div>

        {/* Pagination Info */}
        {expensesData && expensesData.expenses.length > 0 && (
          <div className="mt-3 text-center text-xs text-gray-400">
            {expensesData.expenses.length} of{' '}
            {expensesData.pagination.totalCount} expenses
          </div>
        )}

        {/* Bottom spacer for FAB */}
        <div className="h-20" />
      </div>

      {/* Floating Action Button */}
      <button
        onClick={handleAddExpense}
        className="fixed bottom-6 right-6 w-14 h-14 bg-green-600 text-white rounded-2xl shadow-lg shadow-green-600/30 flex items-center justify-center hover:bg-green-700 active:bg-green-800 transition-all hover:shadow-xl hover:scale-105 z-20"
        aria-label="Add expense"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

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

      {/* Category Manager Modal */}
      <CategoryManager
        restaurantId={restaurantId}
        isOpen={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
      />
    </div>
  );
}
