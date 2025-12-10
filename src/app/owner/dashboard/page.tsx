'use client';

import { useEffect, useState } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

export default function OwnerDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Debug: Check cookies on dashboard load
    console.log('🏠 Owner Dashboard loaded');
    console.log('🍪 Dashboard cookies:', document.cookie);
    console.log('🍪 Dashboard cookie count:', document.cookie.split(';').filter(c => c.trim()).length);
    
    fetchUserData();
    fetchRestaurants();
    fetchMonthlyRevenue();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await ApiClient.get<{ user: any }>('/api/auth/me');
      setUser(response.user);
    } catch (error) {
      if (error instanceof ApiClientError) {
        console.error('[OwnerDashboard] Failed to fetch user data:', error.message);
      } else {
        console.error('[OwnerDashboard] Failed to fetch user data:', error);
      }
    }
  };

  const fetchRestaurants = async () => {
    try {
      const response = await ApiClient.get<{ restaurants: any[] }>('/api/restaurants/owner');
      setRestaurants(response.restaurants || []);
    } catch (error) {
      if (error instanceof ApiClientError) {
        console.error('[OwnerDashboard] Failed to fetch restaurants:', error.message);
      } else {
        console.error('[OwnerDashboard] Failed to fetch restaurants:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlyRevenue = async () => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const response = await ApiClient.get<{ data?: { summary?: { totalRevenue?: number } } }>(
        '/api/reports/sales',
        {
          params: {
            startDate: startOfMonth.toISOString(),
            endDate: endOfMonth.toISOString()
          }
        }
      );

      setMonthlyRevenue(response.data?.summary?.totalRevenue || 0);
    } catch (error) {
      if (error instanceof ApiClientError) {
        console.error('Failed to fetch monthly revenue:', error.message);
      } else {
        console.error('Failed to fetch monthly revenue:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading owner dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Restaurant Owner Dashboard</h1>
              <p className="text-sm text-gray-500">
                Welcome back, {user?.firstName} {user?.lastName}
              </p>
              <p className="text-sm text-gray-500">
                {user?.companyName}
              </p>
            </div>
            <div className="text-sm text-gray-500">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Restaurant Owner
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Stats */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">R</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      My Restaurants
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {restaurants.length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">A</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Active Restaurants
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {restaurants.filter(r => r.isActive).length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">$</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Monthly Revenue
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      ${monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Restaurants List */}
        <div className="mt-8">
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                My Restaurants
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Manage your restaurant locations
              </p>
            </div>
            <ul className="divide-y divide-gray-200">
              {restaurants.map((restaurant) => (
                <li key={restaurant.id}>
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {restaurant.name.charAt(0)}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="flex items-center">
                            <p className="text-sm font-medium text-gray-900">
                              {restaurant.name}
                            </p>
                            <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              restaurant.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {restaurant.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex items-center text-sm text-gray-500">
                            <p>{restaurant.address}</p>
                            <p className="ml-4">
                              Currency: {restaurant.currency}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Slug</p>
                          <p className="text-sm font-medium text-gray-900">
                            {restaurant.slug}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          {restaurant.isActive ? (
                            <a 
                              href="/dashboard"
                              className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                            >
                              Manage Restaurant
                            </a>
                          ) : (
                            <div className="group relative">
                              <button 
                                disabled
                                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-400 bg-gray-100 cursor-not-allowed"
                              >
                                Manage Restaurant
                              </button>
                              <div className="absolute z-50 w-72 p-3 -top-16 left-0 text-sm text-white bg-gray-900 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                                <div className="relative">
                                  Restaurant is inactive. Please contact the platform administrator to reactivate your restaurant.
                                  {/* Arrow pointing down */}
                                  <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
                                </div>
                              </div>
                            </div>
                          )}
                          <a 
                            href={`/owner/restaurant/${restaurant.id}/profile`}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                          >
                            Edit Profile
                          </a>
                          <a 
                            href={`http://${restaurant.slug}.localhost:3000`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-3 py-2 border border-blue-300 shadow-sm text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            View Public Page
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Quick Actions
              </h3>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                  Add New Restaurant
                </button>
                <button className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                  View Analytics
                </button>
                <button className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                  Billing Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}