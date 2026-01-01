'use client';

import { useState } from 'react';
import { MenuCategory } from '@/types/menu';
import { ChevronDown, X } from 'lucide-react';

interface CategoryDropdownProps {
  categories: MenuCategory[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onModalStateChange?: (isOpen: boolean) => void;
}

export function CategoryDropdown({
  categories,
  activeCategory,
  onCategoryChange,
  onModalStateChange,
}: CategoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeCategoryData = categories.find(
    (cat) => cat.id === activeCategory
  );

  const handleSelect = (categoryId: string) => {
    onCategoryChange(categoryId);
    handleClose();
  };

  const handleOpen = () => {
    console.log('[CategoryDropdown] Opening modal');
    setIsOpen(true);
    onModalStateChange?.(true);
  };

  const handleClose = () => {
    console.log('[CategoryDropdown] Closing modal');
    setIsOpen(false);
    onModalStateChange?.(false);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between bg-white border border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <span className="font-medium text-gray-900">
            {activeCategoryData?.name || 'All Categories'}
          </span>
          {activeCategoryData && (
            <span className="text-sm text-gray-500">
              ({activeCategoryData.menuItems.length} items)
            </span>
          )}
        </div>
        <ChevronDown className="h-5 w-5 text-gray-600" />
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          {/* Backdrop - Very Light and Transparent */}
          <div
            className="absolute inset-0 transition-opacity"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
            onClick={handleClose}
          />

          {/* Modal Content */}
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-hidden animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Select Category
              </h3>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Category List */}
            <div className="overflow-y-auto max-h-[calc(80vh-4rem)]">
              {categories.map((category) => {
                const isActive = category.id === activeCategory;
                return (
                  <button
                    key={category.id}
                    onClick={() => handleSelect(category.id)}
                    className={`w-full flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-b-0 transition-colors ${
                      isActive
                        ? 'bg-orange-50 border-l-4 border-l-orange-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {isActive && (
                        <div className="w-2 h-2 bg-orange-500 rounded-full" />
                      )}
                      <span
                        className={`font-medium ${
                          isActive ? 'text-orange-700' : 'text-gray-900'
                        }`}
                      >
                        {category.name}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {category.menuItems.length} items
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
