'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Users,
  Settings,
  BarChart3,
  Plus,
  Edit,
  Eye,
  Trash2,
  ExternalLink,
  Menu,
  X,
  Home,
  UserCheck,
  Shield,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { ApiClient, ApiClientError } from '@/lib/api-client';

export default function AdminDashboardPage() {
  const [user, setUser] = useState<{
    userType: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null>(null);
  const [restaurants, setRestaurants] = useState<
    Array<{
      id: string;
      name: string;
      slug: string;
      address: string;
      isActive: boolean;
      ownerId: string;
      owner?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
      _count?: {
        staff: number;
        tables: number;
        orders: number;
        menuItems: number;
      };
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const checkAdminAuth = useCallback(async () => {
    try {
      const data = await ApiClient.get<{ user: { userType: string; firstName: string; lastName: string; email: string } }>('/auth/me');
        // Check if user is platform admin
        if (data.user.userType !== 'platform_admin') {
          // Redirect non-admin users
          window.location.href = '/dashboard';
          return;
        }

        setUser(data.user);
        fetchRestaurants();
    } catch (error) {
      console.error('Failed to check admin auth:', error);
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    checkAdminAuth();
  }, [checkAdminAuth]);

  const fetchRestaurants = async () => {
    try {
      const data = await ApiClient.get<{
        restaurants: Array<{
          id: string;
          name: string;
          slug: string;
          address: string;
          isActive: boolean;
          ownerId: string;
          owner?: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
          };
          _count?: {
            staff: number;
            tables: number;
            orders: number;
            menuItems: number;
          };
        }>;
      }>('/restaurants?includeStats=true');
      setRestaurants(data.restaurants);
    } catch (error) {
      console.error('Failed to fetch restaurants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRestaurant = async (
    restaurantId: string,
    restaurantName: string
  ) => {
    if (
      !confirm(
        `Are you sure you want to delete "${restaurantName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await ApiClient.delete<{ error?: string }>(`/restaurants/${restaurantId}`);
        setRestaurants(restaurants.filter((r) => r.id !== restaurantId));
        alert('Restaurant deleted successfully');
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'Failed to delete restaurant. Please try again.';
      console.error('Failed to delete restaurant:', error);
      alert(message);
    }
  };

  const handleToggleActive = async (
    restaurantId: string,
    currentStatus: boolean
  ) => {
    try {
      await ApiClient.patch(`/restaurants/${restaurantId}`, { isActive: !currentStatus });
        setRestaurants(
          restaurants.map((r) =>
            r.id === restaurantId ? { ...r, isActive: !currentStatus } : r
          )
        );
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'Failed to update restaurant status. Please try again.';
      console.error('Failed to update restaurant status:', error);
      alert(message);
    }
  };

  const logout = async () => {
    try {
      await ApiClient.post('/auth/logout', {});
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading platform dashboard...</p>
        </div>
      </div>
    );
  }

  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: Home, current: true },
    {
      name: 'Restaurants',
      href: '/admin/restaurants',
      icon: Building2,
      current: false,
    },
    { name: 'Users', href: '/admin/users', icon: Users, current: false },
    {
      name: 'Analytics',
      href: '/admin/analytics',
      icon: BarChart3,
      current: false,
    },
    {
      name: 'Settings',
      href: '/admin/settings',
      icon: Settings,
      current: false,
    },
  ];

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? 'block' : 'hidden'} fixed inset-0 z-50 lg:relative lg:inset-auto lg:block lg:w-64 lg:flex-shrink-0`}
      >
        <div className="relative flex w-64 flex-col bg-white border-r border-gray-200">
          {/* Sidebar header */}
          <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600" />
              <span className="ml-2 text-lg font-semibold text-gray-900">
                QR Admin
              </span>
            </div>
            <button
              type="button"
              className="lg:hidden -mr-2 p-2 rounded-md text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* User info */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.firstName?.charAt(0)}
                  {user?.lastName?.charAt(0)}
                </span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500">Platform Administrator</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  item.current
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Logout */}
          <div className="px-4 py-4 border-t border-gray-200">
            <button
              onClick={logout}
              className="flex items-center w-full px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-gray-600 bg-opacity-75 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <div className="bg-white shadow-sm border-b border-gray-200 lg:hidden">
          <div className="px-4 py-4">
            <button
              type="button"
              className="p-2 rounded-md text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 relative overflow-y-auto">
          <div className="px-6 py-8">
            {/* Page header */}
            <div className="md:flex md:items-center md:justify-between mb-8">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                  Platform Dashboard
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Monitor and manage all restaurants in the platform
                </p>
              </div>
              <div className="mt-4 flex md:mt-0 md:ml-4">
                <Link
                  href="/admin/restaurants/new"
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Restaurant
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 mb-8">
              <div className="bg-white overflow-hidden shadow-sm rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Building2 className="h-8 w-8 text-blue-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Restaurants
                        </dt>
                        <dd className="text-2xl font-bold text-gray-900">
                          {restaurants.length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow-sm rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <UserCheck className="h-8 w-8 text-green-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Active Restaurants
                        </dt>
                        <dd className="text-2xl font-bold text-gray-900">
                          {restaurants.filter((r) => r.isActive).length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow-sm rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Users className="h-8 w-8 text-purple-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Restaurant Owners
                        </dt>
                        <dd className="text-2xl font-bold text-gray-900">
                          {new Set(restaurants.map((r) => r.ownerId)).size}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow-sm rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <BarChart3 className="h-8 w-8 text-orange-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Staff
                        </dt>
                        <dd className="text-2xl font-bold text-gray-900">
                          {restaurants.reduce(
                            (sum, r) => sum + (r._count?.staff || 0),
                            0
                          )}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Restaurants List */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      All Restaurants
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      Manage all restaurants in the platform
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {restaurants.length} restaurant
                    {restaurants.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {restaurants.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    No restaurants
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Get started by creating a new restaurant.
                  </p>
                  <div className="mt-6">
                    <Link
                      href="/admin/restaurants/new"
                      className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Restaurant
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {restaurants.map((restaurant) => (
                    <li key={restaurant.id}>
                      <div className="px-6 py-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1">
                            <div className="flex-shrink-0">
                              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                                <span className="text-lg font-semibold text-blue-600">
                                  {restaurant.name.charAt(0)}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4 flex-1">
                              <div className="flex items-center">
                                <h4 className="text-sm font-medium text-gray-900">
                                  {restaurant.name}
                                </h4>
                                <span
                                  className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    restaurant.isActive
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {restaurant.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <div className="mt-1">
                                <p className="text-sm text-gray-600">
                                  {restaurant.address}
                                </p>
                                <div className="flex items-center mt-1 text-xs text-gray-500 space-x-4">
                                  <span>
                                    Owner: {restaurant.owner?.firstName}{' '}
                                    {restaurant.owner?.lastName}
                                  </span>
                                  <span>Slug: {restaurant.slug}</span>
                                  {restaurant._count && (
                                    <>
                                      <span>
                                        Staff: {restaurant._count.staff}
                                      </span>
                                      <span>
                                        Tables: {restaurant._count.tables}
                                      </span>
                                      <span>
                                        Orders: {restaurant._count.orders}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() =>
                                window.open(
                                  `http://${restaurant.slug}.localhost:3000`,
                                  '_blank'
                                )
                              }
                              className="inline-flex items-center p-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                              title="View Public Page"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </button>

                            <Link
                              href={`/admin/restaurants/${restaurant.id}`}
                              className="inline-flex items-center p-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>

                            <Link
                              href={`/admin/restaurants/${restaurant.id}/edit`}
                              className="inline-flex items-center p-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                              title="Edit Restaurant"
                            >
                              <Edit className="h-4 w-4" />
                            </Link>

                            <button
                              onClick={() =>
                                handleToggleActive(
                                  restaurant.id,
                                  restaurant.isActive
                                )
                              }
                              className={`inline-flex items-center px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                                restaurant.isActive
                                  ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
                                  : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                              }`}
                              title={
                                restaurant.isActive ? 'Deactivate' : 'Activate'
                              }
                            >
                              {restaurant.isActive ? 'Deactivate' : 'Activate'}
                            </button>

                            <button
                              onClick={() =>
                                handleDeleteRestaurant(
                                  restaurant.id,
                                  restaurant.name
                                )
                              }
                              className="inline-flex items-center p-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100"
                              title="Delete Restaurant"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
