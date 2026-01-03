'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { OrderActionsMenu } from './OrderActionsMenu';
import {
  getNextOrderAction,
  getOrderSummary,
  getElapsedTime,
} from '@/lib/order-utils';
import { formatPrice } from '@/lib/qr-utils';

/**
 * Order summary data structure
 */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
  estimatedReadyTime?: string;
  version: number; // For optimistic locking
  hasModifications?: boolean; // Modification indicator
  modificationCount?: number; // Number of modifications
  table: {
    tableNumber: string;
    tableName?: string;
  };
  customerSession?: {
    customerName?: string;
    customerPhone?: string;
  };
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    menuItem: {
      id: string;
      name: string;
      price: number;
    };
  }[];
}

export interface OrderCardProps {
  /** Order data to display */
  order: OrderSummary;
  /** Callback when order status is updated */
  onStatusUpdate: (orderId: string, newStatus: string) => Promise<void>;
  /** Callback when view details is clicked */
  onViewDetails?: (orderId: string) => void;
  /** Callback when modify is clicked */
  onModify?: (orderId: string) => void;
  /** Callback when cancel is clicked */
  onCancel?: (orderId: string) => void;
  /** Whether the order is currently being updated */
  isUpdating?: boolean;
}

/**
 * Get border color class based on order status
 */
function getStatusBorderColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'border-l-orange-500'; // Urgent - matches orange button
    case 'confirmed':
      return 'border-l-blue-500'; // Acknowledged - matches blue button
    case 'preparing':
      return 'border-l-green-500'; // In progress - matches green button
    case 'ready':
      return 'border-l-green-500'; // Completed - matches green status
    case 'served':
      return 'border-l-gray-400'; // Archived
    default:
      return 'border-l-gray-300';
  }
}

/**
 * OrderCard - Mobile-optimized card component for displaying individual orders
 *
 * Features color-coded left border for quick status identification
 */
export function OrderCard({
  order,
  onStatusUpdate,
  onViewDetails,
  onModify,
  onCancel,
  isUpdating = false,
}: OrderCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const nextAction = getNextOrderAction(order.status);
  const itemSummary = getOrderSummary(order.items);
  const borderColor = getStatusBorderColor(order.status);

  const handleActionClick = async () => {
    if (!nextAction || isProcessing || isUpdating) return;

    setIsProcessing(true);
    try {
      await onStatusUpdate(order.id, nextAction.nextStatus);
    } finally {
      setIsProcessing(false);
    }
  };

  // Format timestamp
  const orderTime = new Date(order.createdAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Simple solid button colors
  const buttonColorClasses = {
    blue: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
    orange: 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800',
    green: 'bg-green-600 hover:bg-green-700 active:bg-green-800',
    gray: 'bg-gray-600 hover:bg-gray-700 active:bg-gray-800',
  };

  // Enhanced styling for pending orders (needs confirmation)
  const isPending = order.status === 'pending';
  const cardBackgroundClass = isPending ? 'bg-orange-50' : 'bg-white';
  const borderWidthClass = isPending ? 'border-l-8' : 'border-l-4';
  const shadowClass = isPending ? 'shadow-md' : 'shadow-sm';

  return (
    <div
      className={`${cardBackgroundClass} rounded-lg ${shadowClass} border border-gray-200 ${borderWidthClass} ${borderColor} p-3 transition-all hover:shadow-md animate-card-appear`}
      role="article"
      aria-label={`Order ${order.orderNumber} for table ${order.table.tableNumber}`}
    >
      {/* Header: Table Number + Status + Actions */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            Table {order.table.tableNumber}
          </h3>
          {order.table.tableName && (
            <p className="text-xs text-gray-500">{order.table.tableName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} size="sm" />
          {(onViewDetails || onModify || onCancel) && (
            <OrderActionsMenu
              order={order}
              onViewDetails={onViewDetails || (() => {})}
              onModify={onModify || (() => {})}
              onCancel={onCancel || (() => {})}
            />
          )}
        </div>
      </div>

      {/* Modification Indicator */}
      {order.hasModifications && (
        <div className="flex items-center gap-1 text-xs text-orange-600 mb-2">
          <AlertCircle className="h-3 w-3" />
          <span>Modified {order.modificationCount}x</span>
        </div>
      )}

      {/* Order Details - Compact */}
      <div className="space-y-1 mb-3">
        {/* Order Number + Items */}
        {/* Order Number + Items */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900">{order.orderNumber}</span>
          <span className="text-gray-600">{itemSummary}</span>
        </div>

        {/* Customer Type + Age/Time + Price */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            {order.customerSession?.customerName ? 'Dine-in' : 'Walk-in'}
            {' • '}
            {isPending
              ? `Pending ${getElapsedTime(order.createdAt)}`
              : orderTime}
          </span>
          <span className="font-bold text-gray-900">
            {formatPrice(order.totalAmount)}
          </span>
        </div>
      </div>

      {/* Action Button - Modern Design */}
      {nextAction && (
        <button
          onClick={handleActionClick}
          disabled={isProcessing || isUpdating}
          className={`w-full min-h-[44px] rounded-lg font-medium text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${
            buttonColorClasses[
              nextAction.color as keyof typeof buttonColorClasses
            ]
          }`}
          aria-label={`${nextAction.label} for order ${order.orderNumber}`}
        >
          {isProcessing || isUpdating ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            nextAction.label
          )}
        </button>
      )}

      {/* No Action Available (Served/Cancelled) */}
      {!nextAction && (
        <div className="text-center py-2 text-sm text-gray-500">
          No actions available
        </div>
      )}
    </div>
  );
}
