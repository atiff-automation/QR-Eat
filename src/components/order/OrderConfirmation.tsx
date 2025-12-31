'use client';

import { formatPrice } from '@/lib/qr-utils';
import { OrderResponse } from '@/types/order';
import { CheckCircle } from 'lucide-react';

interface OrderConfirmationProps {
  order: OrderResponse;
  onNewOrder: () => void;
}

export function OrderConfirmation({
  order,
  onNewOrder,
}: OrderConfirmationProps) {
  return (
    <div className="h-[calc(100vh-80px)] flex flex-col bg-white overflow-hidden">
      {/* Success Header - Fixed */}
      <div className="flex-shrink-0 bg-gradient-to-r from-orange-50 to-orange-100 p-4 text-center border-b border-orange-200">
        <div className="flex justify-center mb-2">
          <div className="w-14 h-14 bg-orange-500 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Order Placed Successfully!
        </h2>
        <p className="text-sm text-gray-600">Thank you for your order</p>
      </div>

      {/* Content - Flexible, Centered */}
      <div className="flex-1 flex flex-col justify-center px-6 py-3">
        <div className="space-y-4 max-w-md mx-auto w-full">
          {/* Order Number */}
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">Order Number</p>
            <h3 className="text-2xl font-bold text-gray-900">
              #{order.orderNumber}
            </h3>
          </div>

          {/* Total Amount */}
          <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Total Amount</p>
            <p className="text-3xl font-bold text-orange-600">
              {formatPrice(order.totalAmount)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Pay at the counter when ready
            </p>
          </div>

          {/* Simple Instructions */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <h4 className="font-semibold text-gray-900 mb-2 text-center text-sm">
              What&apos;s Next?
            </h4>
            <div className="space-y-1.5 text-sm text-gray-700">
              <div className="flex items-start">
                <span className="text-orange-500 mr-2 font-bold">1.</span>
                <span>Your order has been sent to the kitchen</span>
              </div>
              <div className="flex items-start">
                <span className="text-orange-500 mr-2 font-bold">2.</span>
                <span>We&apos;ll prepare your food fresh</span>
              </div>
              <div className="flex items-start">
                <span className="text-orange-500 mr-2 font-bold">3.</span>
                <span>Staff will bring it to your table</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Fixed */}
      <div className="flex-shrink-0 px-6 pb-4 pt-3 border-t border-gray-200 bg-white">
        <button
          onClick={onNewOrder}
          className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-3.5 px-6 rounded-lg transition-all duration-200 transform active:scale-98 touch-target text-base mb-2"
        >
          Order More Items
        </button>
        <p className="text-center text-xs text-gray-500">
          Need help? Ask any staff member
        </p>
      </div>
    </div>
  );
}
