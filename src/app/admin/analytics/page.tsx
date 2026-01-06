'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Building2,
  ShoppingCart,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import { ApiClient, ApiClientError } from '@/lib/api-client';

interface AnalyticsData {
  overview: {
    totalRevenue: number;
    totalOrders: number;
    totalRestaurants: number;
    totalUsers: number;
    revenueGrowth: number;
    ordersGrowth: number;
  };
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
  topRestaurants: Array<{
    id: string;
    name: string;
    revenue: number;
    orders: number;
    growth: number;
  }>;
  platformMetrics: {
    averageOrderValue: number;
    conversionRate: number;
    activeRestaurantsRate: number;
    userRetentionRate: number;
  };
}

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await ApiClient.get<{ analytics: AnalyticsData }>(
        `/admin/analytics?range=${dateRange}`
      );
      setAnalytics(data.analytics);
    } catch {
      console.error('Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const exportData = async () => {
    try {
      const data = await ApiClient.get<Blob>(
        `/admin/analytics/export?range=${dateRange}`
      );
      {
        const url = window.URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `platform-analytics-${dateRange}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : 'Failed to export data';
      alert(message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Failed to load analytics data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Platform Analytics
              </h1>
              <p className="text-sm text-gray-500">
                Performance metrics across all restaurants
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 3 months</option>
                <option value="1y">Last year</option>
              </select>
              <button
                onClick={exportData}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
              <Link href="/admin/dashboard">
                <button className="text-gray-600 hover:text-gray-900">
                  ← Back to Dashboard
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-700">
                  Total Revenue
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  ${analytics.overview.totalRevenue.toLocaleString()}
                </p>
                <p
                  className={`text-sm ${analytics.overview.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {analytics.overview.revenueGrowth >= 0 ? '+' : ''}
                  {analytics.overview.revenueGrowth.toFixed(1)}% vs last period
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                  <ShoppingCart className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-700">
                  Total Orders
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {analytics.overview.totalOrders.toLocaleString()}
                </p>
                <p
                  className={`text-sm ${analytics.overview.ordersGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {analytics.overview.ordersGrowth >= 0 ? '+' : ''}
                  {analytics.overview.ordersGrowth.toFixed(1)}% vs last period
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-purple-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-700">
                  Active Restaurants
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {analytics.overview.totalRestaurants}
                </p>
                <p className="text-sm text-gray-600">
                  {analytics.platformMetrics.activeRestaurantsRate.toFixed(1)}%
                  active rate
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                  <Users className="h-4 w-4 text-orange-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-700">Total Users</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {analytics.overview.totalUsers.toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">
                  {analytics.platformMetrics.userRetentionRate.toFixed(1)}%
                  retention rate
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue Chart */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900">Revenue Trend</h2>
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-600">
                Average Order Value: $
                {analytics.platformMetrics.averageOrderValue.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="h-64 flex items-end justify-between space-x-2">
            {analytics.revenueByMonth.map((month, index) => {
              const maxRevenue = Math.max(
                ...analytics.revenueByMonth.map((m) => m.revenue)
              );
              const height = (month.revenue / maxRevenue) * 100;

              return (
                <div key={index} className="flex flex-col items-center flex-1">
                  <div className="w-full flex items-end justify-center mb-2">
                    <div
                      className="bg-blue-500 rounded-t w-full max-w-12 transition-all duration-300 hover:bg-blue-600"
                      style={{ height: `${height}%` }}
                      title={`$${month.revenue.toLocaleString()} (${month.orders} orders)`}
                    ></div>
                  </div>
                  <span className="text-xs text-gray-600 transform -rotate-45 origin-center">
                    {month.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Restaurants */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            Top Performing Restaurants
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Restaurant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orders
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Growth
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.topRestaurants.map((restaurant, index) => (
                  <tr key={restaurant.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            #{index + 1}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {restaurant.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        ${restaurant.revenue.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {restaurant.orders.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          restaurant.growth >= 0
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {restaurant.growth >= 0 ? '+' : ''}
                        {restaurant.growth.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
