'use client';

import { useState } from 'react';
import { AccessControl } from '@/components/dashboard/AccessControl';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { ApiClientError } from '@/lib/api-client';
import {
  Plus,
  RefreshCw,
  UtensilsCrossed,
  Edit2,
  Star,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useCurrency } from '@/lib/hooks/queries/useRestaurantSettings';
import {
  useMenuCategories,
  useToggleItemStatus,
  useToggleCategoryStatus,
  useDeleteMenuItem,
  useDeleteCategory,
  useCreateMenuItem,
  useCreateCategory,
  useUpdateMenuItem,
  useUpdateCategory,
  MenuItem,
  MenuCategory,
  VariationGroup,
} from '@/lib/hooks/queries/useMenu';
import { VariationManager } from '@/components/menu/VariationManager';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';

export default function MenuPage() {
  // TanStack Query for data fetching
  const {
    data: categories = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useMenuCategories();
  const error = queryError?.message || '';

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'categories' | 'items'>('items');
  const [showAddModal, setShowAddModal] = useState<'category' | 'item' | null>(
    null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(
    null
  );
  /* Deletion State */
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: 'category' | 'item';
    data: MenuCategory | MenuItem;
  } | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);

  /* Data Mutations */
  const currency = useCurrency();

  // TanStack Query mutations
  const toggleItemStatus = useToggleItemStatus();
  const toggleCategoryStatusMutation = useToggleCategoryStatus();
  const deleteMenuItemMutation = useDeleteMenuItem();
  const deleteCategoryMutation = useDeleteCategory();

  // No manual fetch needed - TanStack Query handles initial load

  // Refresh handler for manual refresh button
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setViewMode('items');
  };

  const toggleItemAvailability = async (item: MenuItem) => {
    try {
      await toggleItemStatus.mutateAsync({
        id: item.id,
        status: item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });
      console.log(
        `${item.name} ${item.status === 'ACTIVE' ? 'disabled' : 'enabled'} successfully`
      );
    } catch (error) {
      console.error('Failed to toggle item availability:', error);
      alert(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    }
  };

  const toggleCategoryStatus = async (category: MenuCategory) => {
    try {
      await toggleCategoryStatusMutation.mutateAsync({
        id: category.id,
        status: category.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });
      console.log(
        `${category.name} ${category.status === 'ACTIVE' ? 'disabled' : 'enabled'} successfully`
      );
    } catch (error) {
      console.error('Failed to toggle category status:', error);
      alert(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    }
  };

  const handleDeleteCategory = (category: MenuCategory) => {
    setDeleteConfirmation({ type: 'category', data: category });
  };

  const handleDeleteItem = (item: MenuItem) => {
    setDeleteConfirmation({ type: 'item', data: item });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return;

    try {
      if (deleteConfirmation.type === 'category') {
        const category = deleteConfirmation.data as MenuCategory;
        await deleteCategoryMutation.mutateAsync(category.id);
        console.log(`Category "${category.name}" deleted successfully`);
      } else {
        const item = deleteConfirmation.data as MenuItem;
        await deleteMenuItemMutation.mutateAsync(item.id);
        console.log(`Item "${item.name}" deleted successfully`);
      }
      setDeleteConfirmation(null);
    } catch (error) {
      console.error(`Failed to delete ${deleteConfirmation.type}:`, error);
      if (error instanceof ApiClientError) {
        setDeletionError(error.message);
      } else {
        setDeletionError(
          `Failed to delete ${deleteConfirmation.type}. Please try again.`
        );
      }
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-gray-200 h-48 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AccessControl
      allowedRoles={['manager', 'admin']}
      requiredPermissions={['menu:read']}
    >
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header & Controls */}
        <div className="flex items-center gap-2">
          <div className="flex-1 p-1 bg-gray-100 rounded-xl flex items-center">
            {(['categories', 'items'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                  viewMode === mode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Categories View */}
        {viewMode === 'categories' && (
          <div className="space-y-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center justify-between active:scale-[0.99] transition-all"
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => handleCategorySelect(category.id)}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {category.name}
                    </h3>
                    {category.status === 'INACTIVE' && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                  {category.description && (
                    <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                      {category.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-4 pl-4">
                  <span className="bg-gray-50 text-gray-600 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap">
                    {category._count.menuItems} items
                  </span>

                  <div className="flex items-center gap-1 border-l pl-2 border-gray-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCategory(category);
                      }}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategoryStatus(category);
                      }}
                      className={`p-2 rounded-lg transition-colors ${
                        category.status === 'ACTIVE'
                          ? 'text-green-600 hover:bg-red-50 hover:text-red-600'
                          : 'text-gray-300 hover:bg-green-50 hover:text-green-600'
                      }`}
                    >
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          category.status === 'ACTIVE'
                            ? 'bg-green-500'
                            : 'bg-gray-300'
                        }`}
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(category);
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete category"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight
                      className="h-4 w-4 text-gray-300"
                      onClick={() => handleCategorySelect(category.id)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Items View */}
        {viewMode === 'items' && (
          <div className="space-y-4">
            {/* Category Filter */}
            <div className="flex items-center justify-between bg-white p-2 rounded-xl shadow-sm border border-gray-100">
              <div className="flex-1 max-w-xs">
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="w-full bg-transparent border-none text-sm font-medium focus:ring-0 text-gray-900"
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-400 hover:text-blue-600 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {/* Items List */}
            <div className="space-y-3">
              {categories
                .filter(
                  (cat) => !selectedCategory || cat.id === selectedCategory
                )
                .flatMap((cat) => cat.menuItems)
                .map((item) => (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl p-3 border border-gray-100 shadow-sm flex items-start gap-3 active:scale-[0.99] transition-all ${
                      item.status === 'INACTIVE'
                        ? 'grayscale opacity-60 bg-gray-50'
                        : ''
                    }`}
                  >
                    {/* Item Image */}
                    <div className="w-20 h-20 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 relative">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          fill
                          className={`object-cover ${
                            item.status === 'INACTIVE'
                              ? 'grayscale opacity-75'
                              : ''
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <UtensilsCrossed className="h-6 w-6" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-semibold text-gray-900 leading-tight line-clamp-2 text-sm sm:text-base">
                            {item.name}
                          </h3>
                          <span className="font-semibold text-gray-900 whitespace-nowrap text-sm sm:text-base">
                            {formatPrice(item.price)}
                          </span>
                        </div>
                      </div>

                      {item.isFeatured && (
                        <div className="flex items-center gap-1 mt-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            <Star className="w-3 h-3 fill-amber-700" />
                            Featured
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions - Vertical Stack for Mobile */}
                    <div className="flex flex-col items-center justify-center gap-2 pl-2 border-l border-gray-100 self-stretch">
                      <button
                        onClick={() => toggleItemAvailability(item)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          item.status === 'ACTIVE'
                            ? 'text-green-600 bg-green-50'
                            : 'text-gray-300 bg-gray-50'
                        }`}
                        title={
                          item.status === 'ACTIVE'
                            ? 'Mark Unavailable'
                            : 'Mark Available'
                        }
                      >
                        <div
                          className={`w-7 h-4 rounded-full relative transition-colors ${
                            item.status === 'ACTIVE'
                              ? 'bg-green-500'
                              : 'bg-gray-300'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${
                              item.status === 'ACTIVE'
                                ? 'left-[14px]'
                                : 'left-0.5'
                            }`}
                          />
                        </div>
                      </button>
                      <button
                        onClick={() => setEditingItem(item)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Item"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteItem(item);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {categories.length === 0 && !loading && (
          <div className="text-center py-12">
            <UtensilsCrossed className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No menu categories found
            </h3>
            <p className="text-gray-800 mb-4">
              Get started by creating your first menu category
            </p>
            <button
              onClick={() => setShowAddModal('category')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </button>
          </div>
        )}

        {/* Edit Item Modal */}
        {editingItem && (
          <EditItemModal
            item={editingItem}
            categories={categories}
            onClose={() => setEditingItem(null)}
            onSuccess={async () => {
              setEditingItem(null);
              // TanStack Query will auto-refresh after mutation
            }}
          />
        )}

        {/* Edit Category Modal */}
        {editingCategory && (
          <EditCategoryModal
            category={editingCategory}
            onClose={() => setEditingCategory(null)}
            onSuccess={async () => {
              setEditingCategory(null);
              // TanStack Query will auto-refresh after mutation
            }}
          />
        )}

        {/* Add Modals */}
        {showAddModal && (
          <AddModal
            type={showAddModal}
            categories={categories}
            selectedCategory={selectedCategory}
            onClose={() => setShowAddModal(null)}
            onSuccess={async (newItemCategoryId?: string) => {
              const isItemCreation = showAddModal === 'item';
              const currentCategory = selectedCategory;

              setShowAddModal(null);

              // Force refresh categories data
              console.log('Refreshing categories after item creation...');
              // TanStack Query will auto-refresh after mutation

              // If a new item was created, handle navigation
              if (isItemCreation && newItemCategoryId) {
                if (viewMode === 'categories') {
                  // Switch to items view and show the category with new item
                  setSelectedCategory(newItemCategoryId);
                  setViewMode('items');
                } else if (viewMode === 'items') {
                  // If we're already in items view, ensure we can see the new item
                  if (currentCategory === newItemCategoryId) {
                    // We're viewing the same category, refresh the view
                    setSelectedCategory(null);
                    setTimeout(() => {
                      setSelectedCategory(newItemCategoryId);
                      console.log('Switched to category:', newItemCategoryId);
                    }, 100);
                  } else {
                    // Switch to the category where the item was added
                    setSelectedCategory(newItemCategoryId);
                  }
                }
              }

              // Additional fallback refresh after 500ms
              setTimeout(async () => {
                console.log('Fallback refresh...');
                // TanStack Query will auto-refresh after mutation
              }, 500);
            }}
          />
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={!!deleteConfirmation}
          title={
            deleteConfirmation?.type === 'category'
              ? 'Delete Category'
              : 'Delete Item'
          }
          message={
            deletionError
              ? deletionError
              : deleteConfirmation?.type === 'category'
                ? (deleteConfirmation.data as MenuCategory)._count.menuItems > 0
                  ? `Cannot delete "${deleteConfirmation.data.name}" because it contains ${(deleteConfirmation.data as MenuCategory)._count.menuItems} item(s). Please move or delete the items first.`
                  : `Are you sure you want to delete "${deleteConfirmation.data.name}"? This action cannot be undone.`
                : `Are you sure you want to delete "${deleteConfirmation?.data.name}"? This action cannot be undone.`
          }
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteConfirmation(null);
            setDeletionError(null);
          }}
          isLoading={
            deleteCategoryMutation.isPending || deleteMenuItemMutation.isPending
          }
          variant="danger"
          confirmText="Delete"
          isBlocked={
            !!deletionError ||
            (deleteConfirmation?.type === 'category' &&
              (deleteConfirmation.data as MenuCategory)._count.menuItems > 0)
          }
        />
      </div>

      {/* Floating Action Button */}
      <FloatingActionButton
        onClick={() =>
          setShowAddModal(viewMode === 'categories' ? 'category' : 'item')
        }
        ariaLabel={viewMode === 'categories' ? 'Add Category' : 'Add Item'}
      />
    </AccessControl>
  );
}

// Add Modal Component
function AddModal({
  type,
  categories,
  selectedCategory,
  onClose,
  onSuccess,
}: {
  type: 'category' | 'item';
  categories: MenuCategory[];
  selectedCategory: string | null;
  onClose: () => void;
  onSuccess: (newItemCategoryId?: string) => void;
}) {
  const currency = useCurrency();
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    price: number;
    categoryId: string;
    preparationTime: number;
    calories: string;
    imageUrl: string;
    allergens: string[];
    dietaryInfo: string[];
    variationGroups: VariationGroup[];
    isAvailable: boolean;
    isFeatured: boolean;
  }>({
    name: '',
    description: '',
    price: 0,
    categoryId: selectedCategory || '',
    preparationTime: 15,
    calories: '',
    imageUrl: '',
    allergens: [],
    dietaryInfo: [],
    variationGroups: [],
    isAvailable: true,
    isFeatured: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const createCategoryMutation = useCreateCategory();
  const createItemMutation = useCreateMenuItem();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      let newItemCategoryId: string | undefined;

      if (type === 'category') {
        const result = await createCategoryMutation.mutateAsync(formData);
        newItemCategoryId = result.category?.id;
      } else {
        const itemData = {
          ...formData,
          preparationTime: parseInt(formData.preparationTime.toString()) || 15,
          calories: formData.calories ? parseInt(formData.calories) : undefined,
        };
        await createItemMutation.mutateAsync(itemData);
        newItemCategoryId = formData.categoryId;
      }

      onSuccess(newItemCategoryId);
    } catch (err) {
      console.error(`Failed to create ${type}:`, err);
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.details) {
          console.error('Validation Details:', err.details);
        }
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Network error. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div
        className={`bg-white rounded-2xl w-full ${type === 'category' ? 'max-w-sm' : 'max-w-md'} shadow-xl overflow-hidden flex flex-col max-h-[90vh]`}
      >
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
          <h3 className="font-bold text-gray-900">
            {type === 'category' ? 'New Category' : 'New Menu Item'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200"
          >
            <div className="w-5 h-5 flex items-center justify-center">✕</div>
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                placeholder={
                  type === 'category'
                    ? 'e.g. Pasta'
                    : 'e.g. Spaghetti Carbonara'
                }
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 min-h-[80px]"
                placeholder="Brief description..."
              />
            </div>

            {type === 'item' && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Category
                  </label>
                  <div className="relative">
                    <select
                      value={formData.categoryId}
                      onChange={(e) =>
                        setFormData({ ...formData, categoryId: e.target.value })
                      }
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                      required
                    >
                      <option value="">Select Category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                      Price ({currency})
                    </label>
                    <CurrencyInput
                      value={formData.price}
                      onChange={(value) =>
                        setFormData({ ...formData, price: value })
                      }
                      currency={currency}
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                      Prep Time (m)
                    </label>
                    <input
                      type="number"
                      value={formData.preparationTime}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          preparationTime: parseInt(e.target.value),
                        })
                      }
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Calories
                  </label>
                  <input
                    type="number"
                    value={formData.calories}
                    onChange={(e) =>
                      setFormData({ ...formData, calories: e.target.value })
                    }
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Image
                  </label>
                  <ImageUpload
                    value={formData.imageUrl}
                    onChange={(imageUrl) =>
                      setFormData({ ...formData, imageUrl: imageUrl || '' })
                    }
                  />
                </div>

                {/* Allergens */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Allergens
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.allergens.map(
                      (allergen: string, index: number) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded-lg font-medium"
                        >
                          {allergen}
                          <button
                            type="button"
                            onClick={() => {
                              const newAllergens = formData.allergens.filter(
                                (_: string, i: number) => i !== index
                              );
                              setFormData({
                                ...formData,
                                allergens: newAllergens,
                              });
                            }}
                            className="ml-1 text-red-500 hover:text-red-700"
                          >
                            ×
                          </button>
                        </span>
                      )
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add allergen..."
                      className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const value = (
                            e.target as HTMLInputElement
                          ).value.trim();
                          if (value && !formData.allergens.includes(value)) {
                            setFormData({
                              ...formData,
                              allergens: [...formData.allergens, value],
                            });
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = e.currentTarget
                          .previousElementSibling as HTMLInputElement;
                        const value = input.value.trim();
                        if (value && !formData.allergens.includes(value)) {
                          setFormData({
                            ...formData,
                            allergens: [...formData.allergens, value],
                          });
                          input.value = '';
                        }
                      }}
                      className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Dietary Info */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Dietary Info
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.dietaryInfo.map((info: string, index: number) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-lg font-medium"
                      >
                        {info}
                        <button
                          type="button"
                          onClick={() => {
                            const newDietaryInfo = formData.dietaryInfo.filter(
                              (_: string, i: number) => i !== index
                            );
                            setFormData({
                              ...formData,
                              dietaryInfo: newDietaryInfo,
                            });
                          }}
                          className="ml-1 text-green-500 hover:text-green-700"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add dietary info..."
                      className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const value = (
                            e.target as HTMLInputElement
                          ).value.trim();
                          if (value && !formData.dietaryInfo.includes(value)) {
                            setFormData({
                              ...formData,
                              dietaryInfo: [...formData.dietaryInfo, value],
                            });
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = e.currentTarget
                          .previousElementSibling as HTMLInputElement;
                        const value = input.value.trim();
                        if (value && !formData.dietaryInfo.includes(value)) {
                          setFormData({
                            ...formData,
                            dietaryInfo: [...formData.dietaryInfo, value],
                          });
                          input.value = '';
                        }
                      }}
                      className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Availability & Featured */}
                <div className="flex space-x-6 p-1">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isAvailable}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isAvailable: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Available
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isFeatured}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isFeatured: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Featured
                    </span>
                  </label>
                </div>

                {/* Variations Manager */}
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">
                    Variations & Add-ons
                  </h4>
                  <VariationManager
                    value={formData.variationGroups}
                    onChange={(groups) =>
                      setFormData({
                        ...formData,
                        variationGroups: groups,
                      })
                    }
                    currencySymbol={currency}
                  />
                </div>
              </>
            )}

            {error && (
              <div className="text-red-500 text-xs font-medium bg-red-50 p-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all text-sm"
            >
              {isSubmitting
                ? 'Creating...'
                : `Create ${type === 'category' ? 'Category' : 'Item'}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Edit Item Modal Component
function EditItemModal({
  item,
  categories,
  onClose,
  onSuccess,
}: {
  item: MenuItem;
  categories: MenuCategory[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const currency = useCurrency();
  const [formData, setFormData] = useState({
    name: item.name,
    description: item.description || '',
    price: item.price,
    categoryId: item.category?.id || item.categoryId || '',
    preparationTime: item.preparationTime,
    calories: item.calories?.toString() || '',
    imageUrl: item.imageUrl || '',
    allergens: item.allergens || [],
    dietaryInfo: item.dietaryInfo || [],
    status: item.status,
    isFeatured: item.isFeatured,
    variationGroups: item.variationGroups || [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateItemMutation = useUpdateMenuItem();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const payload = {
        id: item.id, // ID is required for the hook
        ...formData,
        calories: formData.calories ? parseInt(formData.calories) : undefined,
      };

      await updateItemMutation.mutateAsync(payload);

      onSuccess();
    } catch (err) {
      console.error('Failed to update item:', err);
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
          <h3 className="font-bold text-gray-900">Edit Menu Item</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200"
          >
            <div className="w-5 h-5 flex items-center justify-center">✕</div>
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Category
              </label>
              <div className="relative">
                <select
                  value={formData.categoryId}
                  onChange={(e) =>
                    setFormData({ ...formData, categoryId: e.target.value })
                  }
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                  required
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Price ({currency})
                </label>
                <CurrencyInput
                  value={formData.price}
                  onChange={(value) =>
                    setFormData({ ...formData, price: value })
                  }
                  currency={currency}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                  Prep Time (m)
                </label>
                <input
                  type="number"
                  value={formData.preparationTime}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      preparationTime: parseInt(e.target.value),
                    })
                  }
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Calories
              </label>
              <input
                type="number"
                value={formData.calories}
                onChange={(e) =>
                  setFormData({ ...formData, calories: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Image
              </label>
              <ImageUpload
                value={formData.imageUrl}
                onChange={(imageUrl) =>
                  setFormData({ ...formData, imageUrl: imageUrl || '' })
                }
              />
            </div>

            {/* Allergens */}
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Allergens
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.allergens.map((allergen, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded-lg font-medium"
                  >
                    {allergen}
                    <button
                      type="button"
                      onClick={() => {
                        const newAllergens = formData.allergens.filter(
                          (_, i) => i !== index
                        );
                        setFormData({ ...formData, allergens: newAllergens });
                      }}
                      className="ml-1 text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add allergen..."
                  className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 text-sm"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !formData.allergens.includes(value)) {
                        setFormData({
                          ...formData,
                          allergens: [...formData.allergens, value],
                        });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    const input = e.currentTarget
                      .previousElementSibling as HTMLInputElement;
                    const value = input.value.trim();
                    if (value && !formData.allergens.includes(value)) {
                      setFormData({
                        ...formData,
                        allergens: [...formData.allergens, value],
                      });
                      input.value = '';
                    }
                  }}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Dietary Info */}
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Dietary Info
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.dietaryInfo.map((info, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-lg font-medium"
                  >
                    {info}
                    <button
                      type="button"
                      onClick={() => {
                        const newDietaryInfo = formData.dietaryInfo.filter(
                          (_, i) => i !== index
                        );
                        setFormData({
                          ...formData,
                          dietaryInfo: newDietaryInfo,
                        });
                      }}
                      className="ml-1 text-green-500 hover:text-green-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add dietary info..."
                  className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 text-sm"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !formData.dietaryInfo.includes(value)) {
                        setFormData({
                          ...formData,
                          dietaryInfo: [...formData.dietaryInfo, value],
                        });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    const input = e.currentTarget
                      .previousElementSibling as HTMLInputElement;
                    const value = input.value.trim();
                    if (value && !formData.dietaryInfo.includes(value)) {
                      setFormData({
                        ...formData,
                        dietaryInfo: [...formData.dietaryInfo, value],
                      });
                      input.value = '';
                    }
                  }}
                  className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex space-x-6 p-1">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.status === 'ACTIVE'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.checked ? 'ACTIVE' : 'INACTIVE',
                    })
                  }
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  Available
                </span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isFeatured}
                  onChange={(e) =>
                    setFormData({ ...formData, isFeatured: e.target.checked })
                  }
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  Featured
                </span>
              </label>
            </div>

            {/* Variations Manager */}
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">
                Variations & Add-ons
              </h4>
              <VariationManager
                value={formData.variationGroups}
                onChange={(groups) =>
                  setFormData({
                    ...formData,
                    variationGroups: groups,
                  })
                }
                currencySymbol={currency}
              />
            </div>

            {error && (
              <div className="text-red-500 text-xs font-medium bg-red-50 p-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all text-sm"
            >
              {isSubmitting ? 'Updating...' : 'Update Item'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Edit Category Modal Component
function EditCategoryModal({
  category,
  onClose,
  onSuccess,
}: {
  category: MenuCategory;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: category.name,
    description: category.description || '',
    status: category.status,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateCategoryMutation = useUpdateCategory();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      await updateCategoryMutation.mutateAsync({
        id: category.id,
        ...formData,
      });

      onSuccess();
    } catch (err) {
      console.error('Failed to update category:', err);
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
          <h3 className="font-bold text-gray-900">Edit Category</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200"
          >
            <div className="w-5 h-5 flex items-center justify-center">✕</div>
          </button>
        </div>

        <div className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 min-h-[80px]"
              />
            </div>

            <div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.status === 'ACTIVE'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.checked ? 'ACTIVE' : 'INACTIVE',
                    })
                  }
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  Active
                </span>
              </label>
            </div>

            {error && (
              <div className="text-red-500 text-xs font-medium bg-red-50 p-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all text-sm"
            >
              {isSubmitting ? 'Updating...' : 'Update Category'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
