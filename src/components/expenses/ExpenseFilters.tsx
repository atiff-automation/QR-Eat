'use client';

import React from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { DateInput } from '@/components/ui/DateInput';
import { useCategories } from '@/hooks/expenses/useCategories';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { getDateRange } from '@/lib/date-utils';

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
  const [searchInput, setSearchInput] = React.useState(filters.search || '');
  const [selectedPreset, setSelectedPreset] = React.useState('month');
  const [showCustomDatePicker, setShowCustomDatePicker] = React.useState(false);
  const [showCategorySheet, setShowCategorySheet] = React.useState(false);
  const [customStartDate, setCustomStartDate] = React.useState('');
  const [customEndDate, setCustomEndDate] = React.useState('');

  const { data: categoriesData } = useCategories(restaurantId);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange({ ...filters, search: searchInput || undefined });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);

    if (preset === 'custom') {
      setShowCustomDatePicker(true);
      return;
    }

    const { startDate, endDate } = getDateRange(preset);
    onFiltersChange({ ...filters, startDate, endDate });
  };

  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      const startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);
      onFiltersChange({ ...filters, startDate, endDate });
      setShowCustomDatePicker(false);
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    onFiltersChange({
      ...filters,
      categoryId: categoryId === 'all' ? undefined : categoryId,
    });
    setShowCategorySheet(false);
  };

  const allCategories = categoriesData
    ? [
        ...categoriesData.categories.COGS,
        ...categoriesData.categories.OPERATING,
        ...categoriesData.categories.OTHER,
      ]
    : [];

  const selectedCategory = allCategories.find(
    (c) => c.id === filters.categoryId
  );

  return (
    <div className="space-y-3">
      {/* Date Preset Pills — always visible */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
        {datePresets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handlePresetChange(preset.value)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedPreset === preset.value
                ? 'bg-green-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Search + Category Filter Row — always visible */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search expenses..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-gray-100 border-0 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors placeholder:text-gray-400"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowCategorySheet(true)}
          className={`flex-shrink-0 p-2.5 rounded-xl transition-colors ${
            filters.categoryId
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title="Filter by category"
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>

      {/* Active category indicator */}
      {selectedCategory && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-gray-500">Filtered:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
            {selectedCategory.name}
            <button
              onClick={() =>
                onFiltersChange({ ...filters, categoryId: undefined })
              }
              className="hover:text-green-900"
            >
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      {/* Category Bottom Sheet */}
      <BottomSheet
        isOpen={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        title="Filter by Category"
      >
        <div className="px-4 py-2 space-y-1">
          <button
            onClick={() => handleCategoryChange('all')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
              !filters.categoryId
                ? 'bg-green-50 text-green-700'
                : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
            }`}
          >
            All Categories
          </button>

          {allCategories.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                COGS
              </div>
              {categoriesData?.categories.COGS.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors flex items-center gap-3 ${
                    filters.categoryId === cat.id
                      ? 'bg-green-50 text-green-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  {cat.name}
                </button>
              ))}

              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Operating
              </div>
              {categoriesData?.categories.OPERATING.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors flex items-center gap-3 ${
                    filters.categoryId === cat.id
                      ? 'bg-green-50 text-green-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  {cat.name}
                </button>
              ))}

              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Other
              </div>
              {categoriesData?.categories.OTHER.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors flex items-center gap-3 ${
                    filters.categoryId === cat.id
                      ? 'bg-green-50 text-green-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  {cat.name}
                </button>
              ))}
            </>
          )}
        </div>
      </BottomSheet>

      {/* Custom Date Picker Modal */}
      {showCustomDatePicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md animate-slide-up">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Custom Date Range
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Start Date
                </label>
                <DateInput
                  value={customStartDate}
                  onChange={setCustomStartDate}
                  className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  End Date
                </label>
                <DateInput
                  value={customEndDate}
                  onChange={setCustomEndDate}
                  className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCustomDatePicker(false)}
                  className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-xl text-sm font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomDateApply}
                  disabled={!customStartDate || !customEndDate}
                  className="flex-1 px-4 py-2.5 text-white bg-green-600 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
