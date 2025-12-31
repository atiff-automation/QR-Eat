'use client';

import { useState } from 'react';
import { Cart } from '@/types/menu';
import { OrderResponse } from '@/types/order';
import { formatPrice } from '@/lib/qr-utils';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { ChevronDown, ChevronUp, User } from 'lucide-react';

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
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (asGuest: boolean = false) => {
    setIsSubmitting(true);
    setError('');

    try {
      const orderRequest = {
        tableId,
        customerInfo: asGuest
          ? undefined
          : {
              name: customerInfo.name || undefined,
              phone: customerInfo.phone || undefined,
              email: customerInfo.email || undefined,
            },
        specialInstructions: specialInstructions || undefined,
      };

      const data = await ApiClient.post<{ order: OrderResponse }>(
        '/qr/orders/create',
        orderRequest
      );
      onOrderCreate(data.order);
    } catch (error) {
      console.error('Order creation error:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-orange-100">
        <h2 className="text-xl font-bold text-gray-900">Complete Your Order</h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Order Summary */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Order Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">
                Items (
                {cart.items.reduce((sum, item) => sum + item.quantity, 0)})
              </span>
              <span className="font-medium text-gray-900">
                {formatPrice(cart.subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tax</span>
              <span className="font-medium text-gray-900">
                {formatPrice(cart.taxAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Service Charge</span>
              <span className="font-medium text-gray-900">
                {formatPrice(cart.serviceCharge)}
              </span>
            </div>
            <div className="border-t-2 border-gray-300 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-orange-600">
                  {formatPrice(cart.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Guest Checkout Button */}
        <div className="text-center">
          <button
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform active:scale-98 disabled:cursor-not-allowed touch-target text-lg"
          >
            {isSubmitting ? 'Submitting...' : 'Continue as Guest'}
          </button>
          <p className="text-sm text-gray-500 mt-2">
            Quick checkout without providing details
          </p>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500">
              or provide your details
            </span>
          </div>
        </div>

        {/* Customer Information (Collapsible) */}
        <div>
          <button
            onClick={() => setShowCustomerInfo(!showCustomerInfo)}
            className="w-full flex items-center justify-between p-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-gray-600" />
              <span className="font-medium text-gray-900">
                Customer Information
              </span>
              <span className="text-sm text-gray-500">(Optional)</span>
            </div>
            {showCustomerInfo ? (
              <ChevronUp className="h-5 w-5 text-gray-600" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-600" />
            )}
          </button>

          {showCustomerInfo && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4 animate-slide-up">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={customerInfo.name}
                  onChange={(e) =>
                    setCustomerInfo((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Your phone number"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Your email address"
                />
              </div>

              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 transform active:scale-98 disabled:cursor-not-allowed touch-target"
              >
                {isSubmitting ? 'Submitting...' : 'Submit with Details'}
              </button>
            </div>
          )}
        </div>

        {/* Special Instructions */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Special Instructions for the Kitchen
          </label>
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            placeholder="Any special requests or dietary requirements..."
          />
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="w-full px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back to Cart
        </button>

        <div className="text-xs text-gray-500 text-center space-y-1">
          <p>By placing this order, you agree to our terms of service.</p>
          <p className="font-semibold text-gray-700">
            Please pay at the counter when ready.
          </p>
        </div>
      </div>
    </div>
  );
}
