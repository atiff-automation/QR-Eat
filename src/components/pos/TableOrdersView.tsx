/**
 * Table Orders View Component
 *
 * Groups pending orders by table for cashier to see all orders
 * at a table and process payment together.
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Component Composition
 * - Accessibility
 */

'use client';

import { useMemo } from 'react';
import type { OrderWithDetails } from '@/types/pos';
import { formatPrice } from '@/lib/qr-utils';
import { Clock, Users } from 'lucide-react';

interface TableOrdersViewProps {
  orders: OrderWithDetails[];
  onSelectOrder: (order: OrderWithDetails) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

interface TableGroup {
  tableId: string;
  tableNumber: string;
  tableName?: string;
  orders: OrderWithDetails[];
  totalAmount: number;
  orderCount: number;
  oldestOrderTime: Date;
}

export function TableOrdersView({
  orders,
  onSelectOrder,
  isLoading,
}: TableOrdersViewProps) {
  // Group orders by table
  const tableGroups = useMemo(() => {
    const groups = new Map<string, TableGroup>();

    orders.forEach((order) => {
      const tableId = order.tableId;

      if (!groups.has(tableId)) {
        groups.set(tableId, {
          tableId,
          tableNumber: order.table?.tableNumber || 'Unknown',
          tableName: order.table?.tableName ?? undefined,
          orders: [],
          totalAmount: 0,
          orderCount: 0,
          oldestOrderTime: order.createdAt,
        });
      }

      const group = groups.get(tableId)!;
      group.orders.push(order);
      group.totalAmount += Number(order.totalAmount);
      group.orderCount += 1;

      if (order.createdAt < group.oldestOrderTime) {
        group.oldestOrderTime = order.createdAt;
      }
    });

    return Array.from(groups.values()).sort(
      (a, b) => a.oldestOrderTime.getTime() - b.oldestOrderTime.getTime()
    );
  }, [orders]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse"
          >
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (tableGroups.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No pending orders</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tableGroups.map((group) => (
        <TableGroupCard
          key={group.tableId}
          group={group}
          onSelectOrder={onSelectOrder}
        />
      ))}
    </div>
  );
}

interface TableGroupCardProps {
  group: TableGroup;
  onSelectOrder: (order: OrderWithDetails) => void;
}

function TableGroupCard({ group, onSelectOrder }: TableGroupCardProps) {
  const waitTime = Math.floor(
    (Date.now() - group.oldestOrderTime.getTime()) / 60000
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-orange-500 transition-all shadow-sm hover:shadow-md">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-orange-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-gray-900">
            Table {group.tableNumber}
          </h3>
          <span className="px-2 py-1 bg-orange-500 text-white text-xs font-semibold rounded">
            {group.orderCount} {group.orderCount === 1 ? 'Order' : 'Orders'}
          </span>
        </div>
        {group.tableName && (
          <p className="text-sm text-gray-600">{group.tableName}</p>
        )}
      </div>

      {/* Orders List */}
      <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
        {group.orders.map((order) => (
          <button
            key={order.id}
            onClick={() => onSelectOrder(order)}
            className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-orange-500 hover:bg-orange-50 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-gray-900">
                #{order.orderNumber}
              </span>
              <span className="text-sm font-bold text-orange-600">
                {formatPrice(Number(order.totalAmount))}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              {new Date(order.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Table Total:
          </span>
          <span className="text-lg font-bold text-gray-900">
            {formatPrice(group.totalAmount)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          Waiting {waitTime} min
        </div>
      </div>
    </div>
  );
}
