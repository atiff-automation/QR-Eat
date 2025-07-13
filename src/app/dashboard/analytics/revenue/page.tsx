'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { 
  AlertTriangle, 
  DollarSign, 
  BarChart3, 
  ClipboardList, 
  TrendingUp, 
  UtensilsCrossed, 
  CreditCard 
} from 'lucide-react';

interface RevenueAnalytics {
  period: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalRevenue: number;
    averageOrderValue: number;
    totalOrders: number;
    revenueGrowth: number;
  };
  revenueOverTime: Array<{
    period: string;
    revenue: number;
    orders: number;
    subtotal: number;
    tax: number;
    averageOrderValue: number;
  }>;
  categoryRevenue: Array<{
    categoryId: string;
    categoryName: string;
    revenue: number;
    quantity: number;
    items: number;
    percentage: number;
  }>;
  paymentMethodRevenue: Array<{
    method: string;
    revenue: number;
    transactions: number;
  }>;
  revenueGrowth: {
    currentPeriod: {
      revenue: number;
      orders: number;
    };
    previousPeriod: {
      revenue: number;
      orders: number;
    };
    growthRate: number;
    orderGrowthRate: number;
    revenueChange: number;
  };
  taxAnalytics: {
    totalSubtotal: number;
    totalTax: number;
    totalRevenue: number;
    averageTaxRate: number;
    taxableOrders: number;
  };
  refundAnalytics: {
    totalRefunds: number;
    refundCount: number;
    refundRate: number;
    averageRefundAmount: number;
  };
}

export default function RevenueAnalyticsPage() {
  const [analytics, setAnalytics] = useState<RevenueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('week');
  const [granularity, setGranularity] = useState('day');

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get staff info to get restaurant ID
      const staffResponse = await fetch('/api/auth/me');
      if (!staffResponse.ok) {
        throw new Error('Failed to get staff info');
      }
      const staffData = await staffResponse.json();
      const restaurantId = staffData.staff.restaurant.id;

      // Fetch analytics
      const response = await fetch(`/api/staff/analytics/${restaurantId}/revenue?period=${period}&granularity=${granularity}`);
      if (!response.ok) {
        throw new Error('Failed to fetch revenue analytics');
      }
      
      const data = await response.json();
      setAnalytics(data.analytics);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period, granularity]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-64"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <button
                  onClick={fetchAnalytics}
                  className="mt-2 text-sm text-red-800 underline hover:text-red-900"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Revenue Analytics</h1>
            <p className="text-gray-600">
              Track financial performance and revenue trends
            </p>
          </div>
          <div className="flex space-x-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        {analytics && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <DollarSign className="h-8 w-8" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                    <p className="text-2xl font-semibold text-gray-900">${analytics.summary.totalRevenue.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <BarChart3 className="h-8 w-8" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Avg Order Value</p>
                    <p className="text-2xl font-semibold text-gray-900">${analytics.summary.averageOrderValue.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ClipboardList className="h-8 w-8" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Total Orders</p>
                    <p className="text-2xl font-semibold text-gray-900">{analytics.summary.totalOrders}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <TrendingUp className="h-8 w-8" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Growth Rate</p>
                    <p className={`text-2xl font-semibold ${analytics.summary.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {analytics.summary.revenueGrowth >= 0 ? '+' : ''}{analytics.summary.revenueGrowth.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue Over Time */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Over Time</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Period
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orders
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Order Value
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tax
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analytics.revenueOverTime.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.period}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ${item.revenue.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.orders}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${item.averageOrderValue.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${item.tax.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Category Revenue */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Category</h3>
              <div className="space-y-4">
                {analytics.categoryRevenue.map((category) => (
                  <div key={category.categoryId} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <UtensilsCrossed className="h-4 w-4" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">{category.categoryName}</p>
                        <p className="text-xs text-gray-500">{category.quantity} items sold</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900">${category.revenue.toFixed(2)}</p>
                      <p className="text-xs text-gray-500">{category.items} menu items</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Methods */}
            {analytics.paymentMethodRevenue.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Payment Method</h3>
                <div className="space-y-4">
                  {analytics.paymentMethodRevenue.map((method) => (
                    <div key={method.method} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <CreditCard className="h-4 w-4" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900 capitalize">{method.method}</p>
                          <p className="text-xs text-gray-500">{method.transactions} transactions</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">${method.revenue.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tax and Refund Analytics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Tax Analytics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Tax Collected</span>
                    <span className="text-sm font-medium text-gray-900">${analytics.taxAnalytics.totalTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Average Tax Rate</span>
                    <span className="text-sm font-medium text-gray-900">{analytics.taxAnalytics.averageTaxRate.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Taxable Orders</span>
                    <span className="text-sm font-medium text-gray-900">{analytics.taxAnalytics.taxableOrders}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Refund Analytics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Refunds</span>
                    <span className="text-sm font-medium text-gray-900">${analytics.refundAnalytics.totalRefunds.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Refund Rate</span>
                    <span className="text-sm font-medium text-gray-900">{analytics.refundAnalytics.refundRate.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Refund Count</span>
                    <span className="text-sm font-medium text-gray-900">{analytics.refundAnalytics.refundCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}