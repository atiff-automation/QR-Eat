'use client';

import { formatPrice } from '@/lib/qr-utils';
import { OrderResponse } from '@/types/order';
import { CheckCircle } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface OrderConfirmationProps {
  order: OrderResponse;
  onNewOrder: () => void;
  currency: string; // Phase 3 - Restaurant Settings
}

export function OrderConfirmation({
  order,
  onNewOrder,
  currency,
}: OrderConfirmationProps) {
  // Lock body scroll to prevent browser UI auto-hiding
  useBodyScrollLock(true);

  return (
    <div className="overflow-hidden max-w-2xl mx-auto">
      {/* Success Header */}
      <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-5 text-center border-b border-orange-200">
        <div className="flex justify-center mb-3">
          <div className="w-14 h-14 bg-orange-500 rounded-full flex items-center justify-center">
            <CheckCircle className="w-9 h-9 text-white" strokeWidth={2.5} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Order Placed Successfully!
        </h2>
        <p className="text-sm text-gray-600">Thank you for your order</p>
      </div>

      {/* Order Details */}
      <div className="p-5 space-y-4">
        {/* Order Number */}
        <div className="text-center">
          <p className="text-xs text-gray-600 mb-0.5">Order Number</p>
          <h3 className="text-2xl font-bold text-gray-900">
            #{order.orderNumber}
          </h3>
        </div>

        {/* Total Amount */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
          {/* Subtotal */}
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotalAmount, currency)}</span>
          </div>

          {/* Tax */}
          <div className="flex justify-between text-sm text-gray-600">
            <span>{order.taxLabelSnapshot || 'Tax'}</span>
            <span>{formatPrice(order.taxAmount, currency)}</span>
          </div>

          {/* Service Charge */}
          <div className="flex justify-between text-sm text-gray-600 border-b border-gray-200 pb-2">
            <span>{order.serviceChargeLabelSnapshot || 'Service Charge'}</span>
            <span>{formatPrice(order.serviceCharge, currency)}</span>
          </div>

          {/* Total Amount */}
          <div className="flex justify-between items-center pt-1">
            <span className="text-sm font-semibold text-gray-900">
              Total Amount
            </span>
            <span className="text-3xl font-bold text-orange-600">
              {formatPrice(order.totalAmount, currency)}
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-2 text-center">
            Pay at the counter when ready
          </p>
        </div>

        {/* Action Buttons */}
        <div
          className="space-y-4"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
          }}
        >
          <button
            onClick={onNewOrder}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 px-6 rounded-lg transition-all duration-200 transform active:scale-98 touch-target text-base"
          >
            Order More Items
          </button>

          <p className="text-center text-xs text-gray-500">
            Need help? Ask any staff member
          </p>
        </div>
      </div>
    </div>
  );
}
