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
import { PaymentInterface } from './PaymentInterface';
import { RefreshCw } from 'lucide-react';

export function CashierDashboard() {
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(
    null
  );

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

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <PendingOrdersGrid
            orders={orders}
            onSelectOrder={setSelectedOrder}
            isLoading={isLoading}
          />
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
