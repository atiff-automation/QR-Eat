'use client';

import { StatCard } from './StatCard';
import {
  ClipboardList,
  ChefHat,
  UtensilsCrossed,
  BarChart3,
} from 'lucide-react';

interface OverviewStats {
  ordersCount: number;
  tablesActive: number;
  tablesTotal: number;
  menuItemsCount: number;
  pendingOrdersCount?: number;
}

interface DashboardStatsGridProps {
  stats: OverviewStats;
  loading?: boolean;
}

export function DashboardStatsGrid({
  stats,
  loading,
}: DashboardStatsGridProps) {
  // Skeleton loader
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 bg-gray-50 rounded-xl animate-pulse border border-gray-100"
          />
        ))}
      </div>
    );
  }

  const hasPendingOrders = (stats.pendingOrdersCount || 0) > 0;
  const hasOccupiedTables = stats.tablesActive > 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <StatCard
        title="Orders"
        value={stats.ordersCount}
        subtitle="Active orders today"
        icon={ClipboardList}
        href="/dashboard/orders"
        color="blue"
        badgeCount={stats.pendingOrdersCount}
        variant={hasPendingOrders ? 'alert' : 'default'}
      />
      <StatCard
        title="Tables"
        value={`${stats.tablesActive}/${stats.tablesTotal}`}
        subtitle="Occupied tables"
        icon={ChefHat}
        href="/dashboard/tables"
        color="green"
        badgeCount={stats.tablesActive}
        variant={hasOccupiedTables ? 'active' : 'default'}
      />
      <StatCard
        title="Menu"
        value={stats.menuItemsCount}
        subtitle="Total items"
        icon={UtensilsCrossed}
        href="/dashboard/menu"
        color="orange"
      />
      <StatCard
        title="Reports"
        value="View"
        subtitle="Analytics & Sales"
        icon={BarChart3}
        href="/dashboard/reports"
        color="purple"
      />
    </div>
  );
}
