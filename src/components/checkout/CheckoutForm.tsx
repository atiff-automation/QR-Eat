'use client';

import { useState } from 'react';
import { Cart } from '@/types/menu';
import { OrderResponse } from '@/types/order';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { ArrowLeft } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface CheckoutFormProps {
  cart: Cart;
  tableId: string;
  sessionId: string | null;
  onOrderCreate: (order: OrderResponse) => void;
  onCancel: () => void;
}

export function CheckoutForm({
  tableId,
  sessionId,
  onOrderCreate,
  onCancel,
}: CheckoutFormProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Lock body scroll to prevent browser UI auto-hiding
  useBodyScrollLock(true);

  const handleSubmit = async (withPhone: boolean = false) => {
    setIsSubmitting(true);
    setError('');

    try {
      const orderRequest = {
        tableId,
        sessionId,
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
    <div className="min-h-[80vh] flex flex-col items-center">
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
        <div className="flex justify-center mb-6">
          <img
            src="/login-illustration.png"
            alt="Login Illustration"
            className="w-40 h-auto object-contain"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800 text-center">{error}</p>
          </div>
        )}

        {/* Phone Input */}
        {/* Description */}
        <p className="text-center text-gray-700 font-medium mb-4">
          Enter your mobile number to proceed
        </p>
        <div className="mb-5">
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
            />
          </div>
        </div>

        {/* Continue Button */}
        <button
          onClick={() => handleSubmit(true)}
          disabled={isSubmitting || phoneNumber.length < 8}
          className="w-full bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors mb-3"
        >
          {isSubmitting ? 'Processing...' : 'Continue'}
        </button>

        {/* Divider */}
        <div className="flex items-center my-3">
          <div className="flex-1 border-t border-gray-300" />
          <span className="px-4 text-gray-400 text-sm">OR</span>
          <div className="flex-1 border-t border-gray-300" />
        </div>

        {/* Guest Button */}
        <button
          onClick={() => handleSubmit(false)}
          disabled={isSubmitting}
          className="w-full bg-white border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors text-base mb-4"
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
