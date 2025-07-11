'use client';

import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/qr-utils';
import { getOrderStatusDisplay } from '@/lib/order-utils';
import { OrderResponse } from '@/types/order';
import { Button } from '@/components/ui/Button';

interface OrderConfirmationProps {
  order: OrderResponse;
  onNewOrder: () => void;
}

export function OrderConfirmation({
  order,
  onNewOrder,
}: OrderConfirmationProps) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (currentOrder.estimatedReadyTime) {
      const updateTimeRemaining = () => {
        const readyTime = new Date(currentOrder.estimatedReadyTime!);
        const now = new Date();
        const diff = readyTime.getTime() - now.getTime();

        if (diff > 0) {
          const minutes = Math.floor(diff / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        } else {
          setTimeRemaining('Ready!');
        }
      };

      updateTimeRemaining();
      const interval = setInterval(updateTimeRemaining, 1000);

      return () => clearInterval(interval);
    }
  }, [currentOrder.estimatedReadyTime]);

  useEffect(() => {
    // Poll for order status updates
    const pollOrderStatus = async () => {
      try {
        const response = await fetch(`/api/orders/${currentOrder.id}`);
        if (response.ok) {
          const data = await response.json();
          setCurrentOrder((prev) => ({
            ...prev,
            status: data.order.status,
            paymentStatus: data.order.paymentStatus,
            estimatedReadyTime: data.order.estimatedReadyTime,
          }));
        }
      } catch (error) {
        console.error('Failed to fetch order status:', error);
      }
    };

    const interval = setInterval(pollOrderStatus, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [currentOrder.id]);

  const statusDisplay = getOrderStatusDisplay(currentOrder.status);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-green-50 p-6 text-center border-b border-green-200">
        <div className="text-green-600 text-4xl mb-2">✓</div>
        <h2 className="text-xl font-semibold text-green-800">
          Order Placed Successfully!
        </h2>
        <p className="text-green-600 mt-1">Thank you for your order</p>
      </div>

      {/* Order Details */}
      <div className="p-6 space-y-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 mb-2">
            Order #{currentOrder.orderNumber}
          </div>
          <div className="flex justify-center">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusDisplay.color}`}
            >
              {statusDisplay.label}
            </span>
          </div>
        </div>

        {/* Estimated Time */}
        {currentOrder.estimatedReadyTime && (
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <h3 className="font-medium text-blue-900 mb-2">
              Estimated Ready Time
            </h3>
            <div className="text-2xl font-bold text-blue-600">
              {timeRemaining || 'Calculating...'}
            </div>
            <p className="text-sm text-blue-600 mt-1">
              Ready at{' '}
              {new Date(currentOrder.estimatedReadyTime).toLocaleTimeString(
                [],
                {
                  hour: '2-digit',
                  minute: '2-digit',
                }
              )}
            </p>
          </div>
        )}

        {/* Order Summary */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Order Summary</h3>
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium">Total Amount</span>
            <span className="text-xl font-bold text-green-600">
              {formatPrice(currentOrder.totalAmount)}
            </span>
          </div>
          <p className="text-sm text-gray-800 mt-2">
            Payment:{' '}
            {currentOrder.paymentStatus === 'pending'
              ? 'Pay when ready'
              : currentOrder.paymentStatus}
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-medium text-yellow-800 mb-2">
            What happens next?
          </h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• Your order has been sent to the kitchen</li>
            <li>• We&apos;ll prepare your food fresh</li>
            <li>• Staff will bring your order to your table when ready</li>
            <li>• Payment will be processed when you&apos;re ready to leave</li>
          </ul>
        </div>

        {/* Status Updates */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-900">Order Progress</h3>
          <div className="space-y-2">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-800">Order placed</span>
            </div>
            <div className="flex items-center">
              <div
                className={`w-4 h-4 rounded-full mr-3 ${
                  ['confirmed', 'preparing', 'ready', 'served'].includes(
                    currentOrder.status
                  )
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`}
              ></div>
              <span className="text-sm text-gray-800">Order confirmed</span>
            </div>
            <div className="flex items-center">
              <div
                className={`w-4 h-4 rounded-full mr-3 ${
                  ['preparing', 'ready', 'served'].includes(currentOrder.status)
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`}
              ></div>
              <span className="text-sm text-gray-800">Preparing your food</span>
            </div>
            <div className="flex items-center">
              <div
                className={`w-4 h-4 rounded-full mr-3 ${
                  ['ready', 'served'].includes(currentOrder.status)
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`}
              ></div>
              <span className="text-sm text-gray-800">Ready for delivery</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Button onClick={onNewOrder} variant="outline" className="w-full">
            Order More Items
          </Button>

          <div className="text-center text-sm text-gray-700">
            <p>Need help? Please ask any staff member</p>
            <p className="mt-1">Order ID: {currentOrder.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
