'use client';

import { useState, useCallback, useMemo } from 'react';
import { MenuCategory, MenuItem, VariationOption, Cart } from '@/types/menu';
import { Search, X } from 'lucide-react';
import { MenuCard } from './MenuCard';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface SearchBarProps {
  menu: MenuCategory[];
  cart: Cart;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    selectedOptions: VariationOption[],
    instructions?: string
  ) => void;
  onModalStateChange: (isOpen: boolean) => void;
  currency: string;
}

export function SearchBar({
  menu,
  cart,
  onAddToCart,
  onModalStateChange,
  currency,
}: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Lock body scroll when search modal is open to prevent browser UI auto-hiding
  useBodyScrollLock(isOpen);

  // Get all items in a flat list
  const allItems = useMemo(() => {
    const items: MenuItem[] = [];
    menu.forEach((category) => {
      items.push(...category.menuItems);
    });
    return items;
  }, [menu]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      // Return all items sorted by isFeatured first
      return [...allItems].sort((a, b) =>
        a.isFeatured === b.isFeatured ? 0 : a.isFeatured ? -1 : 1
      );
    }

    const searchQuery = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(searchQuery) ||
        item.description?.toLowerCase().includes(searchQuery)
    );
  }, [query, allItems]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    onModalStateChange(false);
  }, [onModalStateChange]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    onModalStateChange(true);
  }, [onModalStateChange]);

  return (
    <>
      {/* Search Icon Button */}
      <button
        onClick={handleOpen}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        aria-label="Search menu"
      >
        <Search className="h-5 w-5 text-gray-600" />
      </button>

      {/* Search Modal */}
      {isOpen && (
        <div className="qr-modal-overlay z-50 bg-white flex flex-col">
          {/* Search Header */}
          <div className="flex items-center space-x-3 p-4 border-b border-gray-200 bg-white">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menu items..."
                className="w-full pl-10 pr-10 py-2.5 bg-gray-100 border-none rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                autoFocus
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>
            <button
              onClick={handleClose}
              className="text-gray-600 hover:text-gray-900 font-medium whitespace-nowrap"
            >
              Cancel
            </button>
          </div>

          {/* Search Results */}
          <div className="modal-scrollable flex-1 overflow-y-auto bg-gray-50 p-4">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Search className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No items found</p>
                <p className="text-sm text-gray-400 mt-1">
                  Try searching for something else
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Title */}
                <h3 className="font-bold text-lg text-gray-900">
                  {query ? 'Search Results' : 'Best Sellers & Menu'}
                </h3>

                {/* Grid - Always 2 columns for mobile view */}
                <div className="grid grid-cols-2 gap-3 pb-20">
                  {filteredItems.map((item) => {
                    // Calculate total quantity of this item in cart
                    const cartQuantity = cart.items
                      .filter((cartItem) => cartItem.menuItemId === item.id)
                      .reduce((sum, cartItem) => sum + cartItem.quantity, 0);

                    return (
                      <MenuCard
                        key={item.id}
                        item={item}
                        onAddToCart={onAddToCart}
                        onModalStateChange={onModalStateChange}
                        cartQuantity={cartQuantity}
                        currency={currency}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
