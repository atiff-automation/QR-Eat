'use client';

import { useState } from 'react';
import { Settings, X, ChefHat, Filter } from 'lucide-react';
import { KitchenClock, LiveClock } from '@/components/ui/LiveClock';

interface KitchenHeaderProps {
  counts: {
    confirmed: number;
    preparing: number;
    ready: number;
  };
  categories: { id: string; name: string }[];
  selectedCategories: string[];
  onToggleCategory: (categoryId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  saving?: boolean;
}

export function KitchenHeader({
  counts,
  categories,
  selectedCategories,
  onToggleCategory,
}: KitchenHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Calculate if filtering is active (less than all categories selected)
  const isFiltering =
    categories.length > 0 &&
    selectedCategories.length > 0 &&
    selectedCategories.length < categories.length;

  // Calculate total active orders for mobile badge
  const totalActive = counts.confirmed + counts.preparing;

  return (
    <div className="mb-4 md:mb-6">
      {/* MOBILE HEADER (Focus Mode) */}
      <div className="md:hidden">
        <div className="flex justify-between items-center bg-black p-3 border-b border-gray-800 sticky top-0 z-10 h-16">
          <div className="flex flex-col items-start justify-center min-w-[80px]">
            <span
              className={`px-3 py-1 rounded-lg text-sm font-bold shadow-sm ${
                isFiltering ? 'mb-1' : ''
              } ${
                totalActive < 5
                  ? 'bg-gray-800 text-green-400 border border-green-900/50'
                  : totalActive < 10
                    ? 'bg-gray-800 text-orange-400 border border-orange-900/50'
                    : 'bg-red-900/30 text-red-400 border border-red-800/50'
              }`}
            >
              {totalActive} Active
            </span>
            {isFiltering && (
              <div className="flex items-center gap-1 mt-1 overflow-x-auto max-w-[140px] scrollbar-hide">
                {/* Filter Icon Indicator */}
                <Filter className="h-3 w-3 text-orange-400 flex-shrink-0" />

                {selectedCategories.map((catId) => {
                  const cat = categories.find((c) => c.id === catId);
                  if (!cat) return null;
                  return (
                    <span
                      key={catId}
                      className="text-[10px] bg-gray-800 text-orange-300 px-1.5 py-0.5 rounded border border-gray-700 whitespace-nowrap"
                    >
                      {cat.name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center">
            <LiveClock
              className="text-white font-mono text-2xl font-bold leading-none tracking-wide"
              showSeconds={false}
            />
            {/* Small Date */}
            <div className="text-[11px] text-gray-500 font-medium leading-tight mt-0.5">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </div>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className={`p-2.5 rounded-xl transition-colors ${
              isFiltering
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            <Settings className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* DESKTOP HEADER (Dashboard Mode) */}
      <div className="hidden md:block">
        {/* Top Bar */}
        <div className="flex justify-between items-center bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-700">
          <div className="flex items-center space-x-4">
            <div className="bg-gray-700 p-2 rounded-lg">
              <ChefHat className="h-8 w-8 text-orange-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Kitchen Display
              </h1>
              <div className="flex items-center space-x-2 text-sm text-gray-400">
                {isFiltering ? (
                  <span className="flex items-center text-orange-400 font-medium bg-orange-400/10 px-2 py-0.5 rounded">
                    <Filter className="h-3 w-3 mr-1" />
                    Station Filter Active ({selectedCategories.length})
                  </span>
                ) : (
                  <span>All Stations View</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <KitchenClock className="text-right text-gray-300 font-mono text-xl" />

            {/* Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`p-3 rounded-lg transition-colors border border-gray-600 ${
                isFiltering
                  ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-500' // Highlight if active
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              title="Station Settings"
            >
              <Settings className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Summary Stats Cards */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="bg-blue-900/40 border border-blue-800/50 p-4 rounded-lg text-center backdrop-blur-sm">
            <div className="text-3xl font-bold text-blue-400">
              {counts.confirmed}
            </div>
            <div className="text-sm text-blue-200/70 font-medium uppercase tracking-wider mt-1">
              New Orders
            </div>
          </div>
          <div className="bg-orange-900/40 border border-orange-800/50 p-4 rounded-lg text-center backdrop-blur-sm">
            <div className="text-3xl font-bold text-orange-400">
              {counts.preparing}
            </div>
            <div className="text-sm text-orange-200/70 font-medium uppercase tracking-wider mt-1">
              In Progress
            </div>
          </div>
          <div className="bg-green-900/40 border border-green-800/50 p-4 rounded-lg text-center backdrop-blur-sm">
            <div className="text-3xl font-bold text-green-400">
              {counts.ready}
            </div>
            <div className="text-sm text-green-200/70 font-medium uppercase tracking-wider mt-1">
              Ready
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className="bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-800 flex flex-col max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-800 bg-gray-900 sticky top-0">
              <h2 className="text-xl font-bold text-white">Station Filters</h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 p-2 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto">
              {categories.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No categories found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {categories.map((category) => {
                    const isSelected = selectedCategories.includes(category.id);
                    return (
                      <label
                        key={category.id}
                        className={`flex justify-between items-center p-4 rounded-xl cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-gray-800'
                            : 'bg-gray-800/40 hover:bg-gray-800'
                        }`}
                      >
                        <span
                          className={`font-semibold text-lg ${isSelected ? 'text-white' : 'text-gray-400'}`}
                        >
                          {category.name}
                        </span>

                        {/* Custom Toggle Switch */}
                        <div
                          className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
                            isSelected ? 'bg-green-500' : 'bg-gray-600'
                          }`}
                        >
                          <div
                            className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                              isSelected ? 'left-6' : 'left-1'
                            }`}
                          />
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isSelected}
                            onChange={() => onToggleCategory(category.id)}
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-gray-800 bg-gray-900 sticky bottom-0">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full bg-white hover:bg-gray-200 text-black font-bold py-4 rounded-xl transition-colors text-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
