'use client';

import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { OrdersOverview } from '@/components/dashboard/OrdersOverview';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { DashboardStatsGrid } from '@/components/dashboard/DashboardStatsGrid';
import { useState, useCallback, useEffect } from 'react';
import { ApiClient } from '@/lib/api-client';

type Timeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface SalesData {
  date: string;
  revenue: number;
  order_count: number;
}

interface AnalyticsResponse {
  success: boolean;
  analytics: {
    overview: {
      totalOrders: number;
      ordersByStatus: Array<{
        status: string;
        count: number;
      }>;
    };
    tableUtilization: Array<{
      status: string;
      ordersCount: number;
    }>;
    totalMenuItemsCount: number;
    topMenuItems: unknown[];
    trends: {
      sales: SalesData[];
    };
  };
}

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('daily');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    ordersCount: number;
    tablesActive: number;
    tablesTotal: number;
    menuItemsCount: number;
    pendingOrdersCount: number;
    salesTrend: SalesData[];
  }>({
    ordersCount: 0,
    tablesActive: 18,
    tablesTotal: 25,
    menuItemsCount: 0,
    pendingOrdersCount: 0,
    salesTrend: [],
  });

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch analytics with selected timeframe
      const data = await ApiClient.get<AnalyticsResponse>(
        '/analytics/dashboard',
        {
          params: { timeframe },
        }
      );

      if (data.success && data.analytics) {
        setStats({
          ordersCount: data.analytics.overview.totalOrders,
          // Use table utilization data if available to count active tables
          tablesActive: data.analytics.tableUtilization.filter(
            (t) => t.status === 'OCCUPIED'
          ).length,
          tablesTotal: data.analytics.tableUtilization.length || 0,
          menuItemsCount: data.analytics.totalMenuItemsCount || 0,
          pendingOrdersCount:
            data.analytics.overview.ordersByStatus.find(
              (s) => s.status === 'PENDING'
            )?.count || 0,
          salesTrend: data.analytics.trends.sales || [],
        });
      }
    } catch (error) {
      console.error('Failed to fetch dashboard analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Time Selector */}
      {/* Timeframe Selector */}
      <div className="flex flex-col sm:flex-row justify-end mb-4">
        <div className="bg-gray-100 p-1 rounded-xl inline-flex self-center sm:self-auto">
          {(['daily', 'weekly', 'monthly', 'yearly'] as Timeframe[]).map(
            (t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  timeframe === t
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            )
          )}
        </div>
      </div>

      {/* Sales Chart Section */}
      <PermissionGuard permission="analytics:read">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Sales Overview
            </h3>
            <p className="text-xs text-gray-500">
              Revenue trend for the selected period
            </p>
          </div>
          <SalesChart
            data={stats.salesTrend}
            loading={loading}
            timeframe={timeframe}
          />
        </div>
      </PermissionGuard>

      {/* Stats Grid */}
      <DashboardStatsGrid
        stats={{
          ordersCount: stats.ordersCount,
          tablesActive: stats.tablesActive,
          tablesTotal: stats.tablesTotal,
          menuItemsCount: stats.menuItemsCount,
          pendingOrdersCount: stats.pendingOrdersCount,
        }}
        loading={loading}
      />

      {/* Recent Orders List */}
      <PermissionGuard permission="orders:read">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
          <OrdersOverview />
        </div>
      </PermissionGuard>
    </div>
  );
}
