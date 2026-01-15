'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  DollarSign,
  BarChart3,
  CheckCircle,
} from 'lucide-react';
import { useOrderAnalytics } from '@/lib/hooks/queries/useAnalytics';

export default function OrderAnalyticsPage() {
  const [period, setPeriod] = useState('week');
  const [granularity, setGranularity] = useState('day');

  const {
    data: analytics,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useOrderAnalytics({
    period,
    granularity,
  });

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to fetch analytics'
    : null;

  if (loading) {
    return (
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
    );
  }

  if (error) {
    return (
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
                onClick={() => refetch()}
                className="mt-2 text-sm text-red-800 underline hover:text-red-900"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Analytics</h1>
          <p className="text-gray-600">
            Track order performance and customer behavior
          </p>
        </div>
        <div className="flex space-x-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="hour">Hourly</option>
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
                  <ClipboardList className="h-8 w-8" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">
                    Total Orders
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {analytics.summary.totalOrders}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-8 w-8" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">
                    Total Revenue
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    ${analytics.summary.totalRevenue.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BarChart3 className="h-8 w-8" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">
                    Avg Order Value
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    ${analytics.summary.averageOrderValue.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">
                    Completed Orders
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {analytics.summary.completedOrders}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Status Distribution */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Order Status Distribution
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {analytics.statusDistribution.map((status) => (
                <div key={status.status} className="text-center">
                  <div className="text-sm font-medium text-gray-500 capitalize">
                    {status.status}
                  </div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {status.count}
                  </div>
                  <div className="text-sm text-gray-500">
                    ${status.revenue.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Peak Hours */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Peak Hours
            </h3>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
              {analytics.peakHours.map((hour) => (
                <div key={hour.hour} className="text-center">
                  <div className="text-xs text-gray-500">{hour.period}</div>
                  <div className="h-16 bg-gray-200 rounded flex items-end justify-center">
                    <div
                      className="bg-blue-500 rounded-t w-full"
                      style={{
                        height: `${Math.max(10, (hour.orders / Math.max(...analytics.peakHours.map((h) => h.orders))) * 100)}%`,
                      }}
                    ></div>
                  </div>
                  <div className="text-xs font-medium text-gray-900">
                    {hour.orders}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Analytics */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Customer Analytics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-semibold text-gray-900">
                  {analytics.customerAnalytics.totalSessions}
                </div>
                <div className="text-sm text-gray-500">Total Sessions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold text-gray-900">
                  {analytics.customerAnalytics.conversionRate}%
                </div>
                <div className="text-sm text-gray-500">Conversion Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold text-gray-900">
                  ${analytics.customerAnalytics.averageSessionValue.toFixed(2)}
                </div>
                <div className="text-sm text-gray-500">Avg Session Value</div>
              </div>
            </div>
          </div>

          {/* Table Performance */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Table Performance
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Table
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sessions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Orders
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Order Value
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analytics.tablePerformance.map((table) => (
                    <tr key={table.tableId}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          Table {table.tableNumber}
                        </div>
                        {table.tableName && (
                          <div className="text-sm text-gray-500">
                            {table.tableName}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {table.sessions}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {table.orders}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${table.revenue.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${table.averageOrderValue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
