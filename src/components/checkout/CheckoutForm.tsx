'use client';

import { useState } from 'react';
import { Cart } from '@/types/menu';
import { OrderResponse } from '@/types/order';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { ArrowLeft } from 'lucide-react';

interface CheckoutFormProps {
  cart: Cart;
  tableId: string;
  onOrderCreate: (order: OrderResponse) => void;
  onCancel: () => void;
}

export function CheckoutForm({
  tableId,
  onOrderCreate,
  onCancel,
}: CheckoutFormProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
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
    <div className="bg-white min-h-[80vh] flex flex-col items-center">
      {/* Header with Back Button */}
      <div className="w-full flex items-center p-4">
        <button
          onClick={onCancel}
          className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-bold ml-2 text-gray-900">
          Login or Create Account
        </h1>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-md px-6 flex-1 flex flex-col justify-center">
        {/* Illustration */}
        <div className="flex justify-center mb-8">
          <img
            src="/login_illustration_1767173833179.png"
            alt="Login Illustration"
            className="w-48 h-auto object-contain" // Adjusted size
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800 text-center">{error}</p>
          </div>
        )}

        {/* Phone Input */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Enter your mobile number to proceed
          </label>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-500 focus-within:border-transparent transition-all">
            <div className="flex items-center px-3 border-r border-gray-200 bg-gray-50 h-12">
              <span className="text-xl mr-2">🇲🇾</span>
              <span className="text-gray-900 font-medium">+60</span>
            </div>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => {
                // Remove non-numeric characters for cleaner input
                const val = e.target.value.replace(/\D/g, '');
                setPhoneNumber(val);
              }}
              placeholder="123456789"
              className="flex-1 h-12 px-4 text-lg text-gray-900 placeholder-gray-400 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Continue Button */}
        <button
          onClick={() => handleSubmit(true)}
          disabled={isSubmitting || !phoneNumber}
          className="w-full bg-slate-500 hover:bg-slate-600 disabled:bg-slate-300 text-white font-bold py-4 rounded-lg uppercase tracking-wide transition-all duration-200 transform active:scale-98 disabled:cursor-not-allowed mb-8"
        >
          {isSubmitting ? 'Processing...' : 'Continue'}
        </button>

        {/* Divider */}
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-400 uppercase tracking-widest text-xs">
              OR
            </span>
          </div>
        </div>

        {/* Guest Button */}
        <button
          onClick={() => handleSubmit(false)}
          disabled={isSubmitting}
          className="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-lg transition-colors mb-12"
        >
          Order as Guest
        </button>

        {/* Terms */}
        <p className="text-xs text-gray-400 text-center leading-relaxed px-4">
          By tapping to continue, you agree to our
          <br />
          <a href="#" className="underline hover:text-gray-600">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="underline hover:text-gray-600">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
