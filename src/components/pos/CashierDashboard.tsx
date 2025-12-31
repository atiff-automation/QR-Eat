/**
 * Cashier Dashboard Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - State Management
 * - Real-time Updates
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import { useState } from 'react';
import type { OrderWithDetails } from '@/types/pos';
import { usePendingOrders } from '@/lib/hooks/queries/useOrders';
import { CashierHeader } from './CashierHeader';
import { PendingOrdersGrid } from './PendingOrdersGrid';
import { TableOrdersView } from './TableOrdersView';
import { PaymentInterface } from './PaymentInterface';
import { RefreshCw, Grid, Table } from 'lucide-react';

type ViewMode = 'all-orders' | 'by-table';

export function CashierDashboard() {
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(
    null
  );
  const [viewMode, setViewMode] = useState<ViewMode>('all-orders');

  const {
    orders,
    isLoading,
    isRefreshing,
    error,
    refetch: refresh,
    totalOrders,
    totalRevenue,
  } = usePendingOrders({
    enabled: true,
    refetchInterval: 30000,
  });

  const handlePaymentComplete = () => {
    setSelectedOrder(null);
    refresh();
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <CashierHeader
        totalOrders={totalOrders}
        totalRevenue={totalRevenue}
        averageProcessingTime="2-3 min"
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Pending Orders
            </h2>

            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('all-orders')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    viewMode === 'all-orders'
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                  All Orders
                </button>
                <button
                  onClick={() => setViewMode('by-table')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    viewMode === 'by-table'
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Table className="w-4 h-4" />
                  By Table
                </button>
              </div>

              {/* Refresh Button */}
              <button
                onClick={refresh}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {viewMode === 'all-orders' ? (
            <PendingOrdersGrid
              orders={orders}
              onSelectOrder={setSelectedOrder}
              isLoading={isLoading}
            />
          ) : (
            <TableOrdersView
              orders={orders}
              onSelectOrder={setSelectedOrder}
              isLoading={isLoading}
              onRefresh={refresh}
            />
          )}
        </div>
      </div>

      {selectedOrder && (
        <PaymentInterface
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
}
