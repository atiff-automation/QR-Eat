'use client';

import { formatPrice } from '@/lib/qr-utils';
import { OrderResponse } from '@/types/order';
import { CheckCircle } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface OrderConfirmationProps {
  order: OrderResponse;
  onNewOrder: () => void;
}

export function OrderConfirmation({
  order,
  onNewOrder,
}: OrderConfirmationProps) {
  // Lock body scroll to prevent browser UI auto-hiding
  useBodyScrollLock(true);

  return (
    <div className="overflow-hidden max-w-2xl mx-auto">
      {/* Success Header */}
      <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-8 text-center border-b border-orange-200">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Order Placed Successfully!
        </h2>
        <p className="text-gray-600">Thank you for your order</p>
      </div>

      {/* Order Details */}
      <div className="p-6 space-y-6">
        {/* Order Number */}
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">Order Number</p>
          <h3 className="text-3xl font-bold text-gray-900">
            #{order.orderNumber}
          </h3>
        </div>

        {/* Total Amount */}
        <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-200">
          <p className="text-sm text-gray-600 mb-2">Total Amount</p>
          <p className="text-4xl font-bold text-orange-600">
            {formatPrice(order.totalAmount)}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Pay at the counter when ready
          </p>
        </div>

        {/* Action Buttons */}
        <div
          className="space-y-3"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
          }}
        >
          <p className="text-center text-sm text-gray-500">
            Need help? Ask any staff member
          </p>

          <button
            onClick={onNewOrder}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform active:scale-98 touch-target text-lg"
          >
            Order More Items
          </button>
        </div>
      </div>
    </div>
  );
}
