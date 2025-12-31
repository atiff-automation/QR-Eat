'use client';

import { useState } from 'react';
import { Cart } from '@/types/menu';
import { OrderResponse } from '@/types/order';
import { formatPrice } from '@/lib/qr-utils';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { Phone } from 'lucide-react';

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
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (withPhone: boolean = false) => {
    setIsSubmitting(true);
    setError('');

    try {
      const orderRequest = {
        tableId,
        customerInfo:
          withPhone && phoneNumber
            ? {
                phone: phoneNumber,
              }
            : undefined,
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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Phone Login Section */}
        {!showPhoneLogin ? (
          <>
            {/* Primary CTA - Login with Phone */}
            <div className="text-center">
              <button
                onClick={() => setShowPhoneLogin(true)}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform active:scale-98 touch-target text-lg flex items-center justify-center space-x-2"
              >
                <Phone className="h-5 w-5" />
                <span>Login to Order</span>
              </button>
              <p className="text-sm text-gray-600 mt-2">
                Get exclusive discounts & earn points
              </p>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">or</span>
              </div>
            </div>

            {/* Secondary CTA - Guest Checkout */}
            <div className="text-center">
              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="w-full bg-white border-2 border-orange-500 text-orange-600 hover:bg-orange-50 disabled:bg-gray-100 disabled:border-gray-300 disabled:text-gray-400 font-bold py-4 px-6 rounded-lg transition-all duration-200 transform active:scale-98 disabled:cursor-not-allowed touch-target text-lg"
              >
                {isSubmitting ? 'Submitting...' : 'Order as Guest'}
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Quick checkout without providing details
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Phone Login Form */}
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">
                  Login to Order
                </h3>
                <p className="text-sm text-gray-500">
                  Enter your phone number to earn points & discounts
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Phone Number <span className="text-orange-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g. +60 123-456-7890"
                  className="w-full p-4 border border-gray-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  required
                  autoFocus
                />
              </div>

              <button
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting || !phoneNumber}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform active:scale-98 disabled:cursor-not-allowed touch-target text-lg"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Order to Kitchen'}
              </button>

              <button
                onClick={() => setShowPhoneLogin(false)}
                className="w-full text-gray-600 hover:text-gray-900 font-medium py-2 text-sm"
              >
                ← Back to options
              </button>
            </div>
          </>
        )}

        {/* Special Instructions - Collapsible */}
        <div>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center text-sm font-semibold text-gray-900 hover:text-orange-600 transition-colors"
          >
            <span>Add Special Instructions</span>
            <svg
              className={`ml-2 h-4 w-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showInstructions && (
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent mt-2"
              rows={3}
              placeholder="Any special requests or dietary requirements..."
            />
          )}
        </div>

        {/* Back to Cart */}
        <button
          onClick={onCancel}
          className="w-full bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 px-6 rounded-lg transition-colors touch-target"
        >
          Back to Cart
        </button>

        {/* Terms */}
        <p className="text-xs text-gray-500 text-center">
          By placing this order, you agree to our terms of service.
          <br />
          Please pay at the counter when ready.
        </p>
      </div>
    </div>
  );
}
