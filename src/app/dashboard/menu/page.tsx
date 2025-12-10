'use client';

import { useState, useEffect } from 'react';
import { AccessControl } from '@/components/dashboard/AccessControl';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import {
  Plus,
  RefreshCw,
  UtensilsCrossed,
  BarChart3,
  Clock,
  Flame,
} from 'lucide-react';
import Image from 'next/image';

interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  menuItems: MenuItem[];
  _count: {
    menuItems: number;
  };
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  preparationTime: number;
  calories?: number;
  allergens: string[];
  dietaryInfo: string[];
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: number;
  categoryId?: string;
  category?: {
    id: string;
    name: string;
  };
  variations: MenuItemVariation[];
}

interface MenuItemVariation {
  id: string;
  name: string;
  priceModifier: number;
  variationType: string;
  isRequired: boolean;
  maxSelections?: number;
  displayOrder: number;
}

export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<
    'categories' | 'items' | 'analytics'
  >('categories');
  const [showAddModal, setShowAddModal] = useState<'category' | 'item' | null>(
    null
  );
  const [analytics, setAnalytics] = useState<{
    topSellingItems: Array<{
      menuItemId: string;
      name: string;
      totalOrders: number;
      totalRevenue: number;
    }>;
    categoryPerformance: Array<{
      categoryId: string;
      name: string;
      totalOrders: number;
      totalRevenue: number;
    }>;
    lowPerformingItems: Array<{ id: string; name: string }>;
    period: string;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(
    null
  );

  useEffect(() => {
    fetchCategories(true);
  }, []);

  useEffect(() => {
    if (viewMode === 'analytics') {
      fetchAnalytics();
    }
  }, [viewMode]);

  const fetchCategories = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    try {
      // Add cache busting parameter to ensure fresh data
      const timestamp = new Date().getTime();
      const data = await ApiClient.get<{ categories: MenuCategory[] }>(
        `/admin/menu/categories?_t=${timestamp}`
      );

      setCategories(data.categories);
      setError('');
      console.log(
        'Categories refreshed:',
        data.categories.length,
        'categories loaded'
      );
      // Debug: Log all items and their imageUrl
      data.categories.forEach((cat: MenuCategory) => {
        cat.menuItems.forEach((item: MenuItem) => {
          console.log(
            'Item:',
            item.name,
            'imageUrl:',
            item.imageUrl,
            'hasImage:',
            !!item.imageUrl
          );
        });
      });
      // Log the specific category you're looking for
      const melayuCategory = data.categories.find(
        (cat: MenuCategory) => cat.name.toLowerCase() === 'melayu'
      );
      if (melayuCategory) {
        console.log(
          'Melayu category found with',
          melayuCategory.menuItems.length,
          'items:',
          melayuCategory.menuItems.map((item: MenuItem) => item.name)
        );
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  };

  const fetchAnalytics = async (period = 'week') => {
    setAnalyticsLoading(true);
    try {
      const data = await ApiClient.get<{ analytics: typeof analytics }>(
        `/admin/menu/analytics?period=${period}`
      );

      setAnalytics(data.analytics);
      setError('');
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setViewMode('items');
  };

  const toggleItemAvailability = async (item: MenuItem) => {
    try {
      await ApiClient.patch(`/api/admin/menu/items/${item.id}`, {
        isAvailable: !item.isAvailable,
      });

      await fetchCategories(false);
      console.log(
        `${item.name} ${item.isAvailable ? 'disabled' : 'enabled'} successfully`
      );
    } catch (error) {
      console.error('Failed to toggle item availability:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Network error. Please try again.');
      }
    }
  };

  const toggleCategoryStatus = async (category: MenuCategory) => {
    try {
      await ApiClient.patch(`/api/admin/menu/categories/${category.id}`, {
        isActive: !category.isActive,
      });

      await fetchCategories(false);
      console.log(
        `${category.name} ${category.isActive ? 'disabled' : 'enabled'} successfully`
      );
    } catch (error) {
      console.error('Failed to toggle category status:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Network error. Please try again.');
      }
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
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
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Menu Management
            </h1>
            <p className="text-gray-800">
              Manage your restaurant menu, categories, and items
            </p>
          </div>
          <div className="flex items-center space-x-4">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => setViewMode('categories')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'categories'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Categories
              </button>
              <button
                onClick={() => setViewMode('items')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'items'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                All Items
              </button>
              <button
                onClick={() => setViewMode('analytics')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'analytics'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Analytics
              </button>
            </div>
            {viewMode !== 'analytics' && (
              <button
                onClick={() =>
                  setShowAddModal(
                    viewMode === 'categories' ? 'category' : 'item'
                  )
                }
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add {viewMode === 'categories' ? 'Category' : 'Item'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Categories View */}
        {viewMode === 'categories' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => (
              <div
                key={category.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {category.name}
                  </h3>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      category.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {category.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {category.description && (
                  <p className="text-sm text-gray-700 mb-4">
                    {category.description}
                  </p>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-700">
                    {category._count.menuItems} items
                  </div>
                  <div className="text-sm text-gray-700">
                    Order: {category.displayOrder}
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => handleCategorySelect(category.id)}
                    className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    View Items
                  </button>
                  <button
                    onClick={() => setEditingCategory(category)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleCategoryStatus(category)}
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      category.isActive
                        ? 'bg-red-100 hover:bg-red-200 text-red-700'
                        : 'bg-green-100 hover:bg-green-200 text-green-700'
                    }`}
                  >
                    {category.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Items View */}
        {viewMode === 'items' && (
          <div className="space-y-6">
            {/* Category Filter */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {selectedCategory && (
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="text-sm text-gray-700 hover:text-gray-900"
                  >
                    Clear filter
                  </button>
                )}
              </div>
              <button
                onClick={() => fetchCategories(false)}
                disabled={refreshing}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
              >
                {refreshing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </>
                )}
              </button>
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {categories
                .filter(
                  (cat) => !selectedCategory || cat.id === selectedCategory
                )
                .flatMap((cat) => cat.menuItems)
                .map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    {/* Item Image */}
                    <div className="h-48 bg-gray-200 relative">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          fill
                          className="object-cover"
                          onLoad={() =>
                            console.log('Image loaded:', item.imageUrl)
                          }
                          onError={(e) => {
                            console.log('Image failed to load:', item.imageUrl);
                            console.error('Image error:', e);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-700">
                          <UtensilsCrossed className="h-10 w-10 text-gray-400" />
                        </div>
                      )}
                      {item.isFeatured && (
                        <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 text-xs font-medium rounded">
                          Featured
                        </div>
                      )}
                      <div
                        className={`absolute top-2 left-2 px-2 py-1 text-xs font-medium rounded ${
                          item.isAvailable
                            ? 'bg-green-500 text-white'
                            : 'bg-red-500 text-white'
                        }`}
                      >
                        {item.isAvailable ? 'Available' : 'Unavailable'}
                      </div>
                    </div>

                    {/* Item Details */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {item.name}
                        </h3>
                        <span className="text-lg font-bold text-green-600">
                          {formatPrice(item.price)}
                        </span>
                      </div>

                      {item.description && (
                        <p className="text-sm text-gray-700 mb-3 line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-sm text-gray-700 mb-3">
                        <span className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />{' '}
                          {item.preparationTime}min
                        </span>
                        {item.calories && (
                          <span className="flex items-center">
                            <Flame className="h-3 w-3 mr-1" /> {item.calories}{' '}
                            cal
                          </span>
                        )}
                      </div>

                      {/* Allergens & Dietary Info */}
                      {(item.allergens.length > 0 ||
                        item.dietaryInfo.length > 0) && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {item.allergens.map((allergen) => (
                            <span
                              key={allergen}
                              className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded"
                            >
                              {allergen}
                            </span>
                          ))}
                          {item.dietaryInfo.map((info) => (
                            <span
                              key={info}
                              className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded"
                            >
                              {info}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Variations */}
                      {item.variations.length > 0 && (
                        <div className="text-xs text-gray-700 mb-3">
                          {item.variations.length} variation
                          {item.variations.length !== 1 ? 's' : ''}
                        </div>
                      )}

                      <div className="flex space-x-2">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-md text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleItemAvailability(item)}
                          className={`px-3 py-2 rounded-md text-sm font-medium ${
                            item.isAvailable
                              ? 'bg-red-100 hover:bg-red-200 text-red-700'
                              : 'bg-green-100 hover:bg-green-200 text-green-700'
                          }`}
                        >
                          {item.isAvailable ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Analytics View */}
        {viewMode === 'analytics' && (
          <div className="space-y-6">
            {/* Period Filter */}
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">
                Period:
              </label>
              {['today', 'week', 'month'].map((period) => (
                <button
                  key={period}
                  onClick={() => fetchAnalytics(period)}
                  className={`px-3 py-1 text-sm rounded-md ${
                    analytics?.period === period
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>

            {analyticsLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-800">Loading analytics...</p>
              </div>
            ) : analytics ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="text-2xl font-bold text-gray-900">
                      {analytics.summary.totalMenuItems}
                    </div>
                    <div className="text-sm text-gray-800">
                      Total Menu Items
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="text-2xl font-bold text-green-600">
                      {analytics.summary.activeMenuItems}
                    </div>
                    <div className="text-sm text-gray-800">Active Items</div>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="text-2xl font-bold text-blue-600">
                      {analytics.summary.itemsOrdered}
                    </div>
                    <div className="text-sm text-gray-800">Items Ordered</div>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="text-2xl font-bold text-orange-600">
                      {formatPrice(analytics.summary.averageOrderValue)}
                    </div>
                    <div className="text-sm text-gray-800">Avg Order Value</div>
                  </div>
                </div>

                {/* Top Selling Items */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Top Selling Items
                  </h3>
                  <div className="space-y-4">
                    {analytics.topSellingItems
                      .slice(0, 5)
                      .map((item, index: number) => (
                        <div
                          key={item.menuItemId}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="text-lg font-bold text-gray-600 w-6">
                              #{index + 1}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">
                                {item.menuItem.name}
                              </div>
                              <div className="text-sm text-gray-700">
                                {item.menuItem.category?.name ||
                                  'Unknown Category'}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-gray-900">
                              {item._sum.quantity} sold
                            </div>
                            <div className="text-sm text-gray-700">
                              {formatPrice(item._sum.totalAmount)}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Category Performance */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Category Performance
                  </h3>
                  <div className="space-y-4">
                    {analytics.categoryPerformance.map((category) => (
                      <div
                        key={category.categoryId}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {category.categoryName}
                          </div>
                          <div className="text-sm text-gray-700">
                            {category.totalQuantity} items sold
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-gray-900">
                            {formatPrice(category.totalRevenue)}
                          </div>
                          <div className="text-sm text-gray-700">
                            {category.orderCount} orders
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Low Performing Items */}
                {analytics.lowPerformingItems.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Items Not Ordered This {analytics.period}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {analytics.lowPerformingItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 bg-orange-50 rounded-lg"
                        >
                          <div>
                            <div className="font-medium text-gray-900">
                              {item.name}
                            </div>
                            <div className="text-sm text-gray-700">
                              {item.category?.name || 'Unknown Category'}
                            </div>
                          </div>
                          <div className="text-sm font-medium text-orange-600">
                            {formatPrice(item.price)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No analytics data
                </h3>
                <p className="text-gray-800">
                  Analytics will appear here once you have orders
                </p>
              </div>
            )}
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
              await fetchCategories(false);
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
              await fetchCategories(false);
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
              await fetchCategories(false);

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
                await fetchCategories(false);
              }, 500);
            }}
          />
        )}
      </div>
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
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    price: string;
    categoryId: string;
    preparationTime: number;
    calories: string;
    imageUrl: string;
    allergens: string[];
    dietaryInfo: string[];
    isAvailable: boolean;
    isFeatured: boolean;
  }>({
    name: '',
    description: '',
    price: '',
    categoryId: selectedCategory || '',
    preparationTime: 15,
    calories: '',
    imageUrl: '',
    allergens: [],
    dietaryInfo: [],
    isAvailable: true,
    isFeatured: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const endpoint =
        type === 'category'
          ? '/api/admin/menu/categories'
          : '/api/admin/menu/items';

      // Fix data types for menu items
      let requestData = formData;
      if (type === 'item') {
        requestData = {
          ...formData,
          price: parseFloat(formData.price) || 0,
          preparationTime: parseInt(formData.preparationTime) || 15,
          calories: formData.calories ? parseInt(formData.calories) : null,
        };
      }

      console.log('Sending request to:', endpoint);
      console.log('Form data being sent:', requestData);

      const responseData = await ApiClient.post<{ category?: { id: string } }>(
        endpoint,
        requestData
      );

      // Pass the category ID back for items so we can navigate to it
      const categoryId =
        type === 'item' ? formData.categoryId : responseData.category?.id;
      onSuccess(categoryId);
    } catch (error) {
      console.error(`Failed to create ${type}:`, error);
      if (error instanceof ApiClientError) {
        setError(error.message);
        if (error.details) {
          console.error('Validation Details:', error.details);
        }
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-96 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Add New {type === 'category' ? 'Category' : 'Menu Item'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              rows={2}
            />
          </div>

          {type === 'item' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) =>
                    setFormData({ ...formData, categoryId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  required
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preparation Time (minutes)
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Calories
                </label>
                <input
                  type="number"
                  value={formData.calories}
                  onChange={(e) =>
                    setFormData({ ...formData, calories: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Menu Item Image
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allergens
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.allergens.map((allergen: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded"
                    >
                      {allergen}
                      <button
                        type="button"
                        onClick={() => {
                          const newAllergens = formData.allergens.filter(
                            (_: string, i: number) => i !== index
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
                    placeholder="Add allergen (e.g., Nuts, Dairy, Gluten)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
                      const input = (e.target as HTMLElement)
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
                    className="px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Dietary Info */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dietary Information
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.dietaryInfo.map((info: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded"
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
                    placeholder="Add dietary info (e.g., Vegan, Vegetarian, Halal)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
                      const input = (e.target as HTMLElement)
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
                    className="px-3 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-sm"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Availability & Featured */}
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isAvailable}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isAvailable: e.target.checked,
                      })
                    }
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Available</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(e) =>
                      setFormData({ ...formData, isFeatured: e.target.checked })
                    }
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Featured</span>
                </label>
              </div>
            </>
          )}

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : `Create ${type}`}
            </button>
          </div>
        </form>
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
  const [formData, setFormData] = useState({
    name: item.name,
    description: item.description || '',
    price: item.price.toString(),
    categoryId: item.category?.id || item.categoryId || '',
    preparationTime: item.preparationTime,
    calories: item.calories?.toString() || '',
    imageUrl: item.imageUrl || '',
    allergens: item.allergens || [],
    dietaryInfo: item.dietaryInfo || [],
    isAvailable: item.isAvailable,
    isFeatured: item.isFeatured,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      await ApiClient.patch(`/admin/menu/items/${item.id}`, {
        ...formData,
        price: parseFloat(formData.price),
        calories: formData.calories ? parseInt(formData.calories) : null,
      });

      onSuccess();
    } catch (error) {
      console.error('Failed to update item:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Edit Menu Item
          </h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 text-2xl"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              value={formData.categoryId}
              onChange={(e) =>
                setFormData({ ...formData, categoryId: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              required
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) =>
                setFormData({ ...formData, price: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preparation Time (minutes)
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Calories
            </label>
            <input
              type="number"
              value={formData.calories}
              onChange={(e) =>
                setFormData({ ...formData, calories: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Menu Item Image
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Allergens
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.allergens.map((allergen, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded"
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
                placeholder="Add allergen (e.g., Nuts, Dairy, Gluten)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
                onClick={() => {
                  const input = document.querySelector(
                    'input[placeholder*="allergen"]'
                  ) as HTMLInputElement;
                  const value = input.value.trim();
                  if (value && !formData.allergens.includes(value)) {
                    setFormData({
                      ...formData,
                      allergens: [...formData.allergens, value],
                    });
                    input.value = '';
                  }
                }}
                className="px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
              >
                Add
              </button>
            </div>
          </div>

          {/* Dietary Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dietary Information
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.dietaryInfo.map((info, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded"
                >
                  {info}
                  <button
                    type="button"
                    onClick={() => {
                      const newDietaryInfo = formData.dietaryInfo.filter(
                        (_, i) => i !== index
                      );
                      setFormData({ ...formData, dietaryInfo: newDietaryInfo });
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
                placeholder="Add dietary info (e.g., Vegan, Vegetarian, Halal)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
                onClick={() => {
                  const input = document.querySelector(
                    'input[placeholder*="dietary"]'
                  ) as HTMLInputElement;
                  const value = input.value.trim();
                  if (value && !formData.dietaryInfo.includes(value)) {
                    setFormData({
                      ...formData,
                      dietaryInfo: [...formData.dietaryInfo, value],
                    });
                    input.value = '';
                  }
                }}
                className="px-3 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-sm"
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isAvailable}
                onChange={(e) =>
                  setFormData({ ...formData, isAvailable: e.target.checked })
                }
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Available</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isFeatured}
                onChange={(e) =>
                  setFormData({ ...formData, isFeatured: e.target.checked })
                }
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Featured</span>
            </label>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Updating...' : 'Update Item'}
            </button>
          </div>
        </form>
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
    isActive: category.isActive,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      await ApiClient.patch(`/admin/menu/categories/${category.id}`, formData);

      onSuccess();
    } catch (error) {
      console.error('Failed to update category:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Edit Category</h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 text-2xl"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              rows={2}
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Updating...' : 'Update Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
