/**
 * Pending Orders Grid Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - No Hardcoding
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import type { OrderWithDetails } from '@/types/pos';
import { PendingOrderCard } from './PendingOrderCard';
import { Loader2 } from 'lucide-react';

interface PendingOrdersGridProps {
  orders: OrderWithDetails[];
  onSelectOrder: (order: OrderWithDetails) => void;
  isLoading?: boolean;
}

export function PendingOrdersGrid({
  orders,
  onSelectOrder,
  isLoading = false,
}: PendingOrdersGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading pending orders...</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-600 text-lg">No pending orders</p>
          <p className="text-gray-500 text-sm">
            All orders have been processed
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {orders.map((order) => (
        <PendingOrderCard
          key={order.id}
          order={order}
          onClick={() => onSelectOrder(order)}
        />
      ))}
    </div>
  );
}
