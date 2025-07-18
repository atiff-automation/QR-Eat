'use client';

import { useState, useEffect } from 'react';
import { Search, ExternalLink, Building2, Globe, ArrowRight, User } from 'lucide-react';
import Link from 'next/link';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  subdomainUrl: string;
  dashboardUrl: string;
  menuUrl: string;
  isActive: boolean;
  owner: {
    email: string;
    firstName: string;
    lastName: string;
  };
}

export default function RestaurantsPage() {
  const [email, setEmail] = useState('');
  const [restaurantSlug, setRestaurantSlug] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchMode, setSearchMode] = useState<'email' | 'slug'>('email');
  const [hostname, setHostname] = useState('yourdomain.com');

  // Set hostname on client side to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHostname(window.location.hostname);
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setRestaurants([]);

    try {
      const payload: any = {};
      if (searchMode === 'email' && email) {
        payload.email = email;
      } else if (searchMode === 'slug' && restaurantSlug) {
        payload.restaurantSlug = restaurantSlug;
      } else {
        setError('Please enter a search term');
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/subdomain/redirect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setRestaurants(data.restaurants || []);
        if (data.restaurants.length === 0) {
          setError('No restaurants found. Please check your search term.');
        }
      } else {
        setError(data.error || 'Search failed');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const quickSearch = (searchEmail: string) => {
    setEmail(searchEmail);
    setSearchMode('email');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">
                Restaurant Directory
              </h1>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <User className="h-4 w-4 mr-2" />
              Login
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Find Your Restaurant
            </h2>
            <p className="text-gray-600">
              Search by your email address or restaurant name to find your dedicated subdomain
            </p>
          </div>

          {/* Search Mode Toggle */}
          <div className="flex justify-center mb-6">
            <div className="bg-gray-100 p-1 rounded-lg flex">
              <button
                type="button"
                onClick={() => setSearchMode('email')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  searchMode === 'email'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Search by Email
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('slug')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  searchMode === 'slug'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Search by Name
              </button>
            </div>
          </div>

          <form onSubmit={handleSearch} className="max-w-md mx-auto">
            <div className="flex gap-3">
              {searchMode === 'email' ? (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              ) : (
                <input
                  type="text"
                  value={restaurantSlug}
                  onChange={(e) => setRestaurantSlug(e.target.value)}
                  placeholder="Enter restaurant name or slug"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 flex items-center"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Search Options */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500 text-center mb-3">Quick Search (Development)</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => quickSearch('mario@rossigroup.com')}
                  className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                >
                  Mario (Owner)
                </button>
                <button
                  onClick={() => quickSearch('john@tastychainfood.com')}
                  className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                >
                  John (Owner)
                </button>
                <button
                  onClick={() => quickSearch('mario@marios-authentic.com')}
                  className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                >
                  Staff Member
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Results */}
        {restaurants.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {restaurants.length === 1 ? 'Restaurant Found' : `${restaurants.length} Restaurants Found`}
            </h3>
            
            {restaurants.map((restaurant) => (
              <div key={restaurant.id} className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-xl font-semibold text-gray-900 mb-2">
                      {restaurant.name}
                    </h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Owner: {restaurant.owner.firstName} {restaurant.owner.lastName} ({restaurant.owner.email})
                    </p>
                    
                    <div className="space-y-2">
                      <div className="flex items-center text-sm">
                        <Globe className="h-4 w-4 text-blue-600 mr-2" />
                        <span className="font-medium text-gray-700 mr-2">Subdomain URL:</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600">
                          {restaurant.subdomainUrl}
                        </code>
                      </div>
                    </div>
                  </div>
                  
                  <div className="ml-6 flex flex-col gap-2">
                    <a
                      href={restaurant.menuUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Menu
                    </a>
                    <a
                      href={restaurant.dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Staff Login
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            How Subdomain Access Works
          </h3>
          <div className="space-y-2 text-sm text-blue-800">
            <p>• Each restaurant has its own dedicated subdomain URL</p>
            <p>• Staff members can log in directly via their restaurant's subdomain</p>
            <p>• Restaurant owners can manage multiple locations from their owner dashboard</p>
            <p>• Customers access the menu directly through the restaurant's subdomain</p>
          </div>
          
          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-sm text-blue-700">
              <strong>Example URL format:</strong> restaurant-name.{hostname}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}