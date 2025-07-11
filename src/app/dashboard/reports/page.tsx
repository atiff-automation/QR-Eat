'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import Link from 'next/link';

export default function ReportsPage() {
  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get staff info to get restaurant ID
    const fetchStaff = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          setStaff(data.staff);
        }
      } catch (error) {
        console.error('Error fetching staff info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStaff();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Analytics & Reports
          </h1>
          <p className="text-gray-600">
            Access comprehensive analytics and generate detailed reports for your restaurant.
          </p>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Order Analytics */}
          <Link
            href="/dashboard/analytics/orders"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-xl">📋</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Order Analytics</h3>
                <p className="text-sm text-gray-500">Track order performance</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Order trends</span>
                <span className="text-green-600">↗️</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Peak hours analysis</span>
                <span className="text-blue-600">📊</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Table performance</span>
                <span className="text-purple-600">🪑</span>
              </div>
            </div>
          </Link>

          {/* Revenue Analytics */}
          <Link
            href="/dashboard/analytics/revenue"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 text-xl">💰</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Revenue Analytics</h3>
                <p className="text-sm text-gray-500">Financial performance</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Revenue trends</span>
                <span className="text-green-600">💹</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Category breakdown</span>
                <span className="text-blue-600">🥘</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Growth analysis</span>
                <span className="text-purple-600">📈</span>
              </div>
            </div>
          </Link>

          {/* Popular Items */}
          <Link
            href="/dashboard/analytics/popular-items"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-purple-600 text-xl">🍽️</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Popular Items</h3>
                <p className="text-sm text-gray-500">Menu performance</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Top selling items</span>
                <span className="text-green-600">🌟</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Trending items</span>
                <span className="text-blue-600">📊</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Customer favorites</span>
                <span className="text-red-600">❤️</span>
              </div>
            </div>
          </Link>

        </div>

        {/* Report Generation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Generate Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            <Link
              href="/dashboard/reports/sales"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">📈</span>
                <h3 className="font-medium text-gray-900">Sales Report</h3>
              </div>
              <p className="text-sm text-gray-600">Comprehensive sales analysis with trends and breakdowns</p>
            </Link>

            <Link
              href="/dashboard/reports/menu"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">🍽️</span>
                <h3 className="font-medium text-gray-900">Menu Report</h3>
              </div>
              <p className="text-sm text-gray-600">Menu item performance and recommendations</p>
            </Link>

            <Link
              href="/dashboard/reports/financial"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">💰</span>
                <h3 className="font-medium text-gray-900">Financial Report</h3>
              </div>
              <p className="text-sm text-gray-600">Revenue, tax, and payment method analysis</p>
            </Link>

            <Link
              href="/dashboard/reports/operational"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">⚙️</span>
                <h3 className="font-medium text-gray-900">Operational Report</h3>
              </div>
              <p className="text-sm text-gray-600">Order processing and operational efficiency</p>
            </Link>

            <Link
              href="/dashboard/reports/customer"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">👥</span>
                <h3 className="font-medium text-gray-900">Customer Report</h3>
              </div>
              <p className="text-sm text-gray-600">Customer behavior and session analysis</p>
            </Link>

            <Link
              href="/dashboard/reports/comprehensive"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">📊</span>
                <h3 className="font-medium text-gray-900">Comprehensive Report</h3>
              </div>
              <p className="text-sm text-gray-600">All-in-one executive summary report</p>
            </Link>

          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/orders/live"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <span className="mr-2">📺</span>
              Live Order Board
            </Link>
            <Link
              href="/dashboard/kitchen"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              <span className="mr-2">🍳</span>
              Kitchen Display
            </Link>
            <button
              onClick={() => window.open('/dashboard/reports/comprehensive', '_blank')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <span className="mr-2">📋</span>
              Export Today's Report
            </button>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}