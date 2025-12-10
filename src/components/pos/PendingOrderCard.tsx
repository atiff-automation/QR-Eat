/**
 * Pending Order Card Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Single Responsibility
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import type { PendingOrderCardProps } from '@/types/pos';
import { formatCurrency, formatRelativeTime } from '@/lib/utils/format';
import { Clock, Users } from 'lucide-react';

export function PendingOrderCard({ order, onClick }: PendingOrderCardProps) {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition-all"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="font-semibold text-lg text-gray-900">
            {order.orderNumber}
          </p>
          <p className="text-sm text-gray-600">
            Table {order.table.tableName || order.table.tableNumber}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold text-lg text-gray-900">
            {formatCurrency(Number(order.totalAmount))}
          </p>
          <p className="text-xs text-gray-500">{totalItems} items</p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          <span>{formatRelativeTime(order.createdAt)}</span>
        </div>

        {order.customerSession?.customerName && (
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>{order.customerSession.customerName}</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-500 font-medium">
          Status:{' '}
          <span className="text-green-600 font-semibold">
            {order.status === 'ready' ? 'Ready for Payment' : 'Served'}
          </span>
        </p>
      </div>
    </button>
  );
}
