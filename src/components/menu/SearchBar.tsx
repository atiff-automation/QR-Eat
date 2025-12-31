'use client';

import { useState, useEffect, useCallback } from 'react';
import { MenuCategory, MenuItem } from '@/types/menu';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  menu: MenuCategory[];
  onItemSelect?: (item: MenuItem) => void;
}

interface SearchResult {
  category: MenuCategory;
  items: MenuItem[];
}

export function SearchBar({ menu, onItemSelect }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchQuery = query.toLowerCase();
    const searchResults: SearchResult[] = [];

    menu.forEach((category) => {
      const matchingItems = category.menuItems.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery) ||
          item.description?.toLowerCase().includes(searchQuery)
      );

      if (matchingItems.length > 0) {
        searchResults.push({
          category,
          items: matchingItems,
        });
      }
    });

    setResults(searchResults);
  }, [query, menu]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  const handleItemClick = useCallback(
    (item: MenuItem) => {
      if (onItemSelect) {
        onItemSelect(item);
      }
      handleClose();
    },
    [onItemSelect, handleClose]
  );

  return (
    <>
      {/* Search Icon Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        aria-label="Search menu"
      >
        <Search className="h-5 w-5 text-gray-600" />
      </button>

      {/* Search Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          {/* Search Header */}
          <div className="flex items-center space-x-2 p-4 border-b border-gray-200">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menu items..."
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                autoFocus
              />
              {query && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
            >
              Cancel
            </button>
          </div>

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto">
            {!query ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <Search className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-gray-500">Search for menu items</p>
                <p className="text-sm text-gray-400 mt-1">
                  Try searching by name or description
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <p className="text-gray-600 font-medium">No results found</p>
                <p className="text-sm text-gray-400 mt-1">
                  Try a different search term
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-6">
                {results.map((result) => (
                  <div key={result.category.id}>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      {result.category.name}
                    </h3>
                    <div className="space-y-2">
                      {result.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleItemClick(item)}
                          className="w-full flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                        >
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">
                              {item.name}
                            </h4>
                            {item.description && (
                              <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                                {item.description}
                              </p>
                            )}
                            <p className="text-sm font-semibold text-orange-600 mt-1">
                              ${item.price.toFixed(2)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
