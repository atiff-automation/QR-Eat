'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { OrderActionsMenu } from './OrderActionsMenu';
import type { OrderAdjustmentAction } from '@/lib/orders/order-adjustment-policy';
import { useAuthUser } from '@/lib/hooks/queries/useAuth';
import {
  getNextOrderAction,
  getOrderSummary,
  getElapsedTime,
} from '@/lib/order-utils';
import { formatPrice } from '@/lib/qr-utils';
import { getOrderPrimaryLabel } from '@/lib/utils/order-display';

/**
 * Order summary data structure
 */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  dailySeq?: number;
  orderType?: string;
  pickupNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  subtotalAmount: number;
  taxAmount: number;
  serviceCharge: number;
  createdAt: string;
  readyAt?: string;
  estimatedReadyTime?: string;
  version: number; // For optimistic locking
  hasModifications?: boolean; // Modification indicator
  modificationCount?: number; // Number of modifications
  table?: {
    tableNumber: string;
    tableName?: string;
  } | null;
  customerSession?: {
    customerName?: string;
    customerPhone?: string;
  };
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    status?: string;
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
  /** Callback when an adjustment action is selected */
  onAdjust?: (orderId: string, action: OrderAdjustmentAction) => void;
  /** Whether the order is currently being updated */
  isUpdating?: boolean;
  /** Currency code for price formatting */
  currency?: string;
}

/**
 * Get border color class based on order status
 */
function getStatusBorderColor(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'border-l-orange-500'; // Urgent - matches orange button
    case 'CONFIRMED':
      return 'border-l-blue-500'; // Acknowledged - matches blue button
    case 'PREPARING':
      return 'border-l-green-500'; // In progress - matches green button
    case 'READY':
      return 'border-l-green-500'; // Completed - matches green status
    case 'SERVED':
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
  onAdjust,
  isUpdating = false,
  currency = 'MYR',
}: OrderCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const nextAction = getNextOrderAction(order.status);
  const itemSummary = getOrderSummary(order.items);
  const borderColor = getStatusBorderColor(order.status);
  const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const readyQty = order.items
    .filter((item) => item.status === 'READY' || item.status === 'SERVED')
    .reduce((sum, item) => sum + item.quantity, 0);
  const showProgress =
    totalQty > 0 &&
    order.items.some((item) => Boolean(item.status)) &&
    ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status);

  const isReady = order.status === 'READY';
  const readyMinutes = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(order.readyAt || order.createdAt).getTime()) /
        60000
    )
  );
  const isTakeaway = order.orderType === 'TAKEAWAY';
  const primaryLabel = getOrderPrimaryLabel(order);
  const secondaryLabel = isTakeaway
    ? order.customerName
    : order.table?.tableName;

  const { data: authData } = useAuthUser();
  const userType = authData?.currentRole?.userType;
  const roleTemplate = authData?.currentRole?.roleTemplate;
  const isOwnerManager =
    userType === 'restaurant_owner' ||
    userType === 'platform_admin' ||
    (userType === 'staff' && roleTemplate === 'manager');
  const isKitchen = userType === 'staff' && roleTemplate === 'kitchen_staff';
  const isWaiter = userType === 'staff' && roleTemplate === 'waiter';

  const canPerformNextAction =
    nextAction?.nextStatus === 'CONFIRMED'
      ? isOwnerManager
      : nextAction?.nextStatus === 'SERVED'
        ? isOwnerManager || isWaiter
        : nextAction?.nextStatus === 'READY' ||
            nextAction?.nextStatus === 'PREPARING'
          ? isOwnerManager || isKitchen
          : false;

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
  const isPending = order.status === 'PENDING';
  const cardBackgroundClass = isPending ? 'bg-orange-50' : 'bg-white';
  const borderWidthClass = isPending ? 'border-l-8' : 'border-l-4';
  const shadowClass = isPending ? 'shadow-md' : 'shadow-sm';

  return (
    <div
      className={`${cardBackgroundClass} rounded-lg ${shadowClass} border border-gray-200 ${borderWidthClass} ${borderColor} p-3 transition-all hover:shadow-md animate-card-appear`}
      role="article"
      aria-label={`Order ${order.orderNumber} for ${primaryLabel}`}
    >
      {/* Header: Table or takeaway label + Status + Actions */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{primaryLabel}</h3>
          {secondaryLabel && (
            <p className="text-xs text-gray-500">{secondaryLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} size="sm" />
          {(onViewDetails || onModify || onAdjust) && (
            <OrderActionsMenu
              order={order}
              onViewDetails={onViewDetails || (() => {})}
              onModify={onModify || (() => {})}
              onAdjust={onAdjust || (() => {})}
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
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900">
            {order.dailySeq
              ? `#${String(order.dailySeq).padStart(3, '0')}`
              : order.orderNumber}
          </span>
          <span className="text-gray-600">{itemSummary}</span>
        </div>

        {showProgress && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Kitchen progress</span>
            <span
              className={
                readyQty === totalQty
                  ? 'font-semibold text-green-600'
                  : 'font-medium text-orange-600'
              }
            >
              {readyQty} of {totalQty} ready
            </span>
          </div>
        )}

        {isReady && (
          <div
            className={`text-xs font-medium ${
              readyMinutes >= 10
                ? 'text-red-600 font-bold'
                : readyMinutes >= 5
                  ? 'text-orange-600'
                  : 'text-green-600'
            }`}
          >
            Ready for {readyMinutes < 1 ? '<1' : readyMinutes} min —{' '}
            {isTakeaway ? 'call the customer' : 'serve it or release the table'}
          </div>
        )}

        {/* Customer Type + Age/Time + Price */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            {isTakeaway
              ? 'Takeaway'
              : order.customerSession?.customerName
                ? 'Dine-in'
                : 'Walk-in'}
            {' • '}
            {isPending
              ? `Pending ${getElapsedTime(order.createdAt)}`
              : orderTime}
          </span>
          <span className="font-bold text-gray-900">
            {formatPrice(order.totalAmount, currency)}
          </span>
        </div>
      </div>

      {/* Action Button - Modern Design */}
      {nextAction && canPerformNextAction && (
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

      {/* No Action Available (Served/Cancelled or role not allowed) */}
      {(!nextAction || !canPerformNextAction) && (
        <div className="text-center py-2 text-sm text-gray-500">
          {nextAction ? 'Waiting for the right role' : 'No actions available'}
        </div>
      )}
    </div>
  );
}
