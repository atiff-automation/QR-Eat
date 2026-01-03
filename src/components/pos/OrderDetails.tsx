/**
 * Order Details Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - No Hardcoding
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import type { OrderDetailsProps } from '@/types/pos';
import { formatCurrency, formatDate } from '@/lib/utils/format';

export function OrderDetails({ order }: OrderDetailsProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          Order Details
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-600">Order Number</p>
            <p className="font-semibold text-gray-900">{order.orderNumber}</p>
          </div>
          <div>
            <p className="text-gray-600">Table</p>
            <p className="font-semibold text-gray-900">
              {order.table.tableName || `Table ${order.table.tableNumber}`}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Created</p>
            <p className="font-semibold text-gray-900">
              {formatDate(order.createdAt)}
            </p>
          </div>
          {order.customerSession?.customerName && (
            <div>
              <p className="text-gray-600">Customer</p>
              <p className="font-semibold text-gray-900">
                {order.customerSession.customerName}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">
          Order Items
        </h4>
        {/* Scrollable order items with max height */}
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-start py-1.5 border-b border-gray-100 last:border-0"
            >
              <div className="flex-1 pr-2">
                <p className="text-sm font-medium text-gray-900">
                  {item.menuItem.name}
                </p>
                <p className="text-xs text-gray-600">
                  {formatCurrency(Number(item.unitPrice))} × {item.quantity}
                </p>
                {item.specialInstructions && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Note: {item.specialInstructions}
                  </p>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrency(Number(item.totalAmount))}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-2 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-medium text-gray-900">
            {formatCurrency(Number(order.subtotalAmount))}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Tax (6%)</span>
          <span className="font-medium text-gray-900">
            {formatCurrency(Number(order.taxAmount))}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Service Charge (10%)</span>
          <span className="font-medium text-gray-900">
            {formatCurrency(Number(order.serviceCharge))}
          </span>
        </div>
        <div className="flex justify-between text-base font-bold pt-1.5 border-t border-gray-200">
          <span className="text-gray-900">Total</span>
          <span className="text-gray-900">
            {formatCurrency(Number(order.totalAmount))}
          </span>
        </div>
      </div>
    </div>
  );
}
