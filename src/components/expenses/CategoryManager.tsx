'use client';

import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useCategories } from '@/hooks/expenses/useCategories';
import { useCreateCategory } from '@/hooks/expenses/useCreateCategory';
import { useDeleteCategory } from '@/hooks/expenses/useDeleteCategory';
import { CategoryBadge } from './CategoryBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CategoryManagerProps {
  restaurantId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CategoryManager({
  restaurantId,
  isOpen,
  onClose,
}: CategoryManagerProps) {
  const { data: categoriesData, isLoading } = useCategories(restaurantId);
  const createMutation = useCreateCategory();
  const deleteMutation = useDeleteCategory();

  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [categoryName, setCategoryName] = React.useState('');
  const [categoryType, setCategoryType] = React.useState<
    'COGS' | 'OPERATING' | 'OTHER'
  >('OPERATING');

  if (!isOpen) return null;

  const allCategories = categoriesData
    ? [
        ...categoriesData.categories.COGS.map((c) => ({
          ...c,
          type: 'COGS' as const,
        })),
        ...categoriesData.categories.OPERATING.map((c) => ({
          ...c,
          type: 'OPERATING' as const,
        })),
        ...categoriesData.categories.OTHER.map((c) => ({
          ...c,
          type: 'OTHER' as const,
        })),
      ]
    : [];

  const handleDelete = async (categoryId: string, categoryName: string) => {
    if (
      confirm(
        `Are you sure you want to delete "${categoryName}"? This action cannot be undone.`
      )
    ) {
      await deleteMutation.mutateAsync(categoryId);
    }
  };

  const handleCreate = async () => {
    if (!categoryName.trim()) {
      return;
    }

    await createMutation.mutateAsync({
      restaurantId,
      name: categoryName.trim(),
      categoryType,
    });

    // Reset form
    setCategoryName('');
    setCategoryType('OPERATING');
    setShowCreateForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Manage Categories
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-6">
              {/* System Categories */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  System Categories
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    (Read-only)
                  </span>
                </h3>
                <div className="space-y-2">
                  {allCategories
                    .filter((cat) => cat.isSystem)
                    .map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <CategoryBadge
                            name={category.name}
                            categoryType={category.categoryType}
                            isSystem={category.isSystem}
                          />
                        </div>
                        <span className="text-sm text-gray-500">
                          System Category
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Custom Categories */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Custom Categories
                  </h3>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium transition-colors"
                  >
                    <Plus size={18} />
                    Add Category
                  </button>
                </div>

                {/* Create Form */}
                {showCreateForm && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3">
                      Create New Category
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category Name
                        </label>
                        <input
                          type="text"
                          value={categoryName}
                          onChange={(e) => setCategoryName(e.target.value)}
                          placeholder="e.g., Marketing, Utilities"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCreate();
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category Type
                        </label>
                        <select
                          value={categoryType}
                          onChange={(e) =>
                            setCategoryType(
                              e.target.value as 'COGS' | 'OPERATING' | 'OTHER'
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="COGS">
                            Cost of Goods Sold (COGS)
                          </option>
                          <option value="OPERATING">Operating Expenses</option>
                          <option value="OTHER">Other Expenses</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowCreateForm(false);
                            setCategoryName('');
                            setCategoryType('OPERATING');
                          }}
                          className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreate}
                          disabled={
                            !categoryName.trim() || createMutation.isPending
                          }
                          className="flex-1 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {createMutation.isPending ? 'Creating...' : 'Create'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Custom Categories List */}
                <div className="space-y-2">
                  {allCategories.filter((cat) => !cat.isSystem).length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      No custom categories yet. Click &ldquo;Add Category&rdquo;
                      to create one.
                    </p>
                  ) : (
                    allCategories
                      .filter((cat) => !cat.isSystem)
                      .map((category) => (
                        <div
                          key={category.id}
                          className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300"
                        >
                          <div className="flex items-center gap-3">
                            <CategoryBadge
                              name={category.name}
                              categoryType={category.categoryType}
                              isSystem={category.isSystem}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleDelete(category.id, category.name)
                              }
                              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete category"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
