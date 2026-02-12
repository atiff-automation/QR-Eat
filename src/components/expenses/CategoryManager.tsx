'use client';

import React from 'react';
import { Plus, Trash2, X, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { useCategories } from '@/hooks/expenses/useCategories';
import { useCreateCategory } from '@/hooks/expenses/useCreateCategory';
import { useDeleteCategory } from '@/hooks/expenses/useDeleteCategory';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CategoryManagerProps {
  restaurantId: string;
  isOpen: boolean;
  onClose: () => void;
}

type CategoryType = 'COGS' | 'OPERATING' | 'OTHER';

const TYPE_CONFIG: Record<
  CategoryType,
  { label: string; shortLabel: string; dot: string; bg: string }
> = {
  COGS: {
    label: 'Cost of Goods Sold',
    shortLabel: 'COGS',
    dot: 'bg-orange-500',
    bg: 'bg-orange-50',
  },
  OPERATING: {
    label: 'Operating Expenses',
    shortLabel: 'Operating',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
  },
  OTHER: {
    label: 'Other',
    shortLabel: 'Other',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50',
  },
};

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
  const [categoryType, setCategoryType] =
    React.useState<CategoryType>('OPERATING');
  const [collapsedSections, setCollapsedSections] = React.useState<
    Record<string, boolean>
  >({});

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus input when create form opens
  React.useEffect(() => {
    if (showCreateForm && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCreateForm]);

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

  const systemCategories = allCategories.filter((c) => c.isSystem);
  const customCategories = allCategories.filter((c) => !c.isSystem);

  const groupedSystem = {
    COGS: systemCategories.filter((c) => c.categoryType === 'COGS'),
    OPERATING: systemCategories.filter((c) => c.categoryType === 'OPERATING'),
    OTHER: systemCategories.filter((c) => c.categoryType === 'OTHER'),
  };

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDelete = async (categoryId: string, name: string) => {
    if (confirm(`Delete "${name}"? This action cannot be undone.`)) {
      await deleteMutation.mutateAsync(categoryId);
    }
  };

  const handleCreate = async () => {
    if (!categoryName.trim()) return;

    await createMutation.mutateAsync({
      restaurantId,
      name: categoryName.trim(),
      categoryType,
    });

    setCategoryName('');
    setCategoryType('OPERATING');
    setShowCreateForm(false);
  };

  const resetForm = () => {
    setShowCreateForm(false);
    setCategoryName('');
    setCategoryType('OPERATING');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200"
        style={{ animationFillMode: 'both' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="px-5 py-4 space-y-5">
              {/* System Categories — grouped by type */}
              {(['COGS', 'OPERATING', 'OTHER'] as CategoryType[]).map(
                (type) => {
                  const items = groupedSystem[type];
                  if (items.length === 0) return null;
                  const config = TYPE_CONFIG[type];
                  const isCollapsed = collapsedSections[`system-${type}`];

                  return (
                    <div key={type}>
                      <button
                        onClick={() => toggleSection(`system-${type}`)}
                        className="flex items-center justify-between w-full mb-2 group"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${config.dot}`}
                          />
                          <span className="text-sm font-medium text-gray-700">
                            {config.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {items.length}
                          </span>
                        </div>
                        {isCollapsed ? (
                          <ChevronDown
                            size={16}
                            className="text-gray-400 group-hover:text-gray-600"
                          />
                        ) : (
                          <ChevronUp
                            size={16}
                            className="text-gray-400 group-hover:text-gray-600"
                          />
                        )}
                      </button>

                      {!isCollapsed && (
                        <div className="space-y-0.5">
                          {items.map((cat) => (
                            <div
                              key={cat.id}
                              className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <span className="text-sm text-gray-800">
                                {cat.name}
                              </span>
                              <Lock
                                size={14}
                                className="text-gray-300 flex-shrink-0"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
              )}

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Custom Categories */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      Custom
                    </span>
                    <span className="text-xs text-gray-400">
                      {customCategories.length}
                    </span>
                  </div>
                  {!showCreateForm && (
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full hover:bg-emerald-100 transition-colors"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  )}
                </div>

                {/* Create Form — inline, minimal */}
                {showCreateForm && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-xl space-y-3">
                    <input
                      ref={inputRef}
                      type="text"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                      placeholder="Category name"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow placeholder:text-gray-400"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate();
                        if (e.key === 'Escape') resetForm();
                      }}
                    />

                    {/* Pill type selector */}
                    <div className="flex gap-1.5 p-1 bg-gray-200/60 rounded-lg">
                      {(['COGS', 'OPERATING', 'OTHER'] as CategoryType[]).map(
                        (type) => (
                          <button
                            key={type}
                            onClick={() => setCategoryType(type)}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                              categoryType === type
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {TYPE_CONFIG[type].shortLabel}
                          </button>
                        )
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={resetForm}
                        className="flex-1 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreate}
                        disabled={
                          !categoryName.trim() || createMutation.isPending
                        }
                        className="flex-1 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {createMutation.isPending ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Creating
                          </span>
                        ) : (
                          'Create'
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Custom Categories List */}
                {customCategories.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400">
                      No custom categories yet
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {customCategories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 group transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_CONFIG[cat.categoryType].dot}`}
                          />
                          <span className="text-sm text-gray-800 truncate">
                            {cat.name}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDelete(cat.id, cat.name)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 -mr-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 sm:opacity-100 transition-all"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
