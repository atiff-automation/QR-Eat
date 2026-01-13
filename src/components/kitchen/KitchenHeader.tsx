'use client';

import { useState } from 'react';
import { Settings, X, Check, ChefHat, Filter } from 'lucide-react';
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
  onSelectAll,
  onDeselectAll,
  saving = false,
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
        <div className="flex justify-between items-center bg-black p-2 border-b border-gray-800 sticky top-0 z-10 h-14">
          <div className="text-white font-bold text-base flex items-center">
            <span className="bg-gray-800 px-2 py-1 rounded text-sm mr-2">
              {totalActive} Active
            </span>
          </div>

          <div className="flex flex-col items-center">
            <LiveClock
              className="text-white font-mono text-lg font-bold leading-none"
              showSeconds={false}
            />
            {/* Small Date */}
            <div className="text-[10px] text-gray-500 font-medium leading-tight">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </div>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className={`p-2 rounded-lg transition-colors ${
              isFiltering
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400'
            }`}
          >
            <Settings className="h-5 w-5" />
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
            className="bg-gray-800 rounded-xl shadow-2xl max-w-md w-full border border-gray-700 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800 rounded-t-xl sticky top-0">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center">
                  <Settings className="mr-2 h-5 w-5 text-gray-400" />
                  Station Settings
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Filter orders by category for this device
                </p>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              <div className="flex justify-between mb-4">
                <button
                  onClick={onSelectAll}
                  className="text-sm text-blue-400 hover:text-blue-300 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-400/10 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={onDeselectAll}
                  className="text-sm text-gray-400 hover:text-gray-200 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Clear All
                </button>
              </div>

              {categories.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No categories found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {categories.map((category) => {
                    const isSelected = selectedCategories.includes(category.id);
                    return (
                      <label
                        key={category.id}
                        className={`flex items-center p-4 rounded-xl cursor-pointer border transition-all duration-200 group ${
                          isSelected
                            ? 'bg-blue-600/20 border-blue-500/50 hover:bg-blue-600/30'
                            : 'bg-gray-700/50 border-transparent hover:bg-gray-700'
                        }`}
                      >
                        <div
                          className={`relative flex items-center justify-center h-6 w-6 rounded border mr-4 transition-colors ${
                            isSelected
                              ? 'bg-blue-500 border-blue-500'
                              : 'bg-gray-800 border-gray-600 group-hover:border-gray-500'
                          }`}
                        >
                          {isSelected && (
                            <Check
                              className="h-4 w-4 text-white"
                              strokeWidth={3}
                            />
                          )}
                          <input
                            type="checkbox"
                            className="absolute opacity-0 w-full h-full cursor-pointer"
                            checked={isSelected}
                            onChange={() => onToggleCategory(category.id)}
                          />
                        </div>
                        <span
                          className={`font-medium text-lg ${
                            isSelected ? 'text-white' : 'text-gray-300'
                          }`}
                        >
                          {category.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-700 bg-gray-800/50 rounded-b-xl sticky bottom-0">
              <div className="flex items-center justify-between text-sm text-gray-400 mb-4">
                <span>Selections are saved to your account</span>
                {saving && (
                  <span className="text-blue-400 animate-pulse">Saving...</span>
                )}
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center"
              >
                <Check className="mr-2 h-5 w-5" />
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
