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
    <div className="bg-white rounded-xl shadow-md overflow-hidden max-w-2xl mx-auto">
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

        {/* Simple Instructions */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <h4 className="font-semibold text-gray-900 mb-3 text-center">
            What&apos;s Next?
          </h4>
          <div className="space-y-2 text-sm text-gray-700">
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

        {/* Action Buttons */}
        <div className="space-y-3 pt-4">
          <button
            onClick={onNewOrder}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform active:scale-98 touch-target text-lg"
          >
            Order More Items
          </button>

          <p className="text-center text-sm text-gray-500">
            Need help? Ask any staff member
          </p>
        </div>
      </div>
    </div>
  );
}
