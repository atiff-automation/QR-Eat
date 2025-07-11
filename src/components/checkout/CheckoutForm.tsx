'use client';

import { useState } from 'react';
import { Cart } from '@/types/menu';
import { CreateOrderRequest, OrderResponse } from '@/types/order';
import { formatPrice } from '@/lib/qr-utils';
import { Button } from '@/components/ui/Button';

interface CheckoutFormProps {
  cart: Cart;
  tableId: string;
  onOrderCreate: (order: OrderResponse) => void;
  onCancel: () => void;
}

export function CheckoutForm({
  cart,
  tableId,
  onOrderCreate,
  onCancel,
}: CheckoutFormProps) {
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    email: '',
  });
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const orderRequest: CreateOrderRequest = {
        tableId,
        customerInfo: {
          name: customerInfo.name || undefined,
          phone: customerInfo.phone || undefined,
          email: customerInfo.email || undefined,
        },
        items: cart.items,
        specialInstructions: specialInstructions || undefined,
      };

      const response = await fetch('/api/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderRequest),
      });

      const data = await response.json();

      if (response.ok) {
        onOrderCreate(data.order);
      } else {
        setError(data.error || 'Failed to create order');
      }
    } catch (error) {
      console.error('Order creation error:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Complete Your Order
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Order Summary */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Order Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>
                Items (
                {cart.items.reduce((sum, item) => sum + item.quantity, 0)})
              </span>
              <span>{formatPrice(cart.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatPrice(cart.taxAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Service Charge</span>
              <span>{formatPrice(cart.serviceCharge)}</span>
            </div>
            <div className="border-t border-gray-300 pt-2">
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatPrice(cart.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div>
          <h3 className="font-medium text-gray-900 mb-3">
            Customer Information (Optional)
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={customerInfo.name}
                onChange={(e) =>
                  setCustomerInfo((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={customerInfo.phone}
                onChange={(e) =>
                  setCustomerInfo((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Your phone number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={customerInfo.email}
                onChange={(e) =>
                  setCustomerInfo((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Your email address"
              />
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Special Instructions for the Kitchen
          </label>
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Any special requests or dietary requirements..."
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="sm:w-auto"
          >
            Back to Menu
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            className="flex-1"
            size="lg"
          >
            Place Order - {formatPrice(cart.totalAmount)}
          </Button>
        </div>

        <div className="text-xs text-gray-500 text-center">
          <p>By placing this order, you agree to our terms of service.</p>
          <p>You'll be able to choose your payment method in the next step.</p>
        </div>
      </form>
    </div>
  );
}
