'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { OrdersOverview } from '@/components/dashboard/OrdersOverview';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Welcome Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to your Dashboard
          </h2>
          <p className="text-gray-600">
            Monitor your restaurant operations, manage orders, and track performance in real-time.
          </p>
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard/orders"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                  <span className="text-blue-600 text-lg">📋</span>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">Orders</h3>
                <p className="text-xs text-gray-500">Manage all orders</p>
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/tables"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                  <span className="text-green-600 text-lg">🪑</span>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">Tables</h3>
                <p className="text-xs text-gray-500">View table status</p>
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/menu"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                  <span className="text-purple-600 text-lg">🍽️</span>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">Menu</h3>
                <p className="text-xs text-gray-500">Manage menu items</p>
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/reports"
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                  <span className="text-orange-600 text-lg">📊</span>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">Reports</h3>
                <p className="text-xs text-gray-500">View analytics</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Orders Overview */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Orders Overview</h2>
            <Link
              href="/dashboard/orders"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View All Orders →
            </Link>
          </div>
          <OrdersOverview />
        </div>

        {/* System Health */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">System Health</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">Database</p>
                <p className="text-xs text-gray-500">Connected</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">Authentication</p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">Payment System</p>
                <p className="text-xs text-gray-500">Operational</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">Real-time Updates</p>
                <p className="text-xs text-gray-500">Redis Pending</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
