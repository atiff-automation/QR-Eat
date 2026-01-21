'use client';

import React from 'react';
import { Search, Calendar, Filter as FilterIcon, X } from 'lucide-react';
import { useCategories } from '@/hooks/expenses/useCategories';

interface ExpenseFiltersProps {
  restaurantId: string;
  filters: {
    startDate?: Date;
    endDate?: Date;
    categoryId?: string;
    search?: string;
  };
  onFiltersChange: (filters: ExpenseFiltersProps['filters']) => void;
}

const datePresets = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];

export function ExpenseFilters({
  restaurantId,
  filters,
  onFiltersChange,
}: ExpenseFiltersProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState(filters.search || '');
  const [selectedPreset, setSelectedPreset] = React.useState('month');

  const { data: categoriesData } = useCategories(restaurantId);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange({ ...filters, search: searchInput });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    const now = new Date();
    let startDate: Date;
    const endDate = now;

    switch (preset) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        return;
    }

    onFiltersChange({ ...filters, startDate, endDate });
  };

  const handleCategoryChange = (categoryId: string) => {
    onFiltersChange({
      ...filters,
      categoryId: categoryId === 'all' ? undefined : categoryId,
    });
  };

  const clearFilters = () => {
    setSearchInput('');
    setSelectedPreset('month');
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    onFiltersChange({ startDate, endDate: now });
  };

  const allCategories = categoriesData
    ? [
        ...categoriesData.categories.COGS,
        ...categoriesData.categories.OPERATING,
        ...categoriesData.categories.OTHER,
      ]
    : [];

  return (
    <div className="bg-white border-b border-gray-200">
      {/* Mobile: Collapsible Filter Button */}
      <div className="lg:hidden px-4 py-3">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg text-gray-700 hover:bg-gray-100"
        >
          <span className="flex items-center gap-2">
            <FilterIcon size={18} />
            Filters
          </span>
          {isOpen ? (
            <X size={18} />
          ) : (
            <span className="text-sm text-gray-500">Tap to expand</span>
          )}
        </button>
      </div>

      {/* Filter Content */}
      <div
        className={`${isOpen ? 'block' : 'hidden'} lg:block px-4 py-4 space-y-4`}
      >
        {/* Search */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search description, vendor, invoice..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date Preset */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar size={16} className="inline mr-1" />
              Date Range
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              {datePresets.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={filters.categoryId || 'all'}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {allCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.categoryType})
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
