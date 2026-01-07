/**
 * Payment Methods Settings Section
 * Cash, Card, E-Wallet toggles
 */

'use client';

import { useState } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AlertTriangle, CheckCircle, CreditCard, Info } from 'lucide-react';

interface PaymentMethods {
  paymentMethods: {
    cash: boolean;
    card: boolean;
    ewallet: boolean;
  };
}

interface PaymentMethodsSectionProps {
  initialData: PaymentMethods;
  onUpdate: () => void;
}

export function PaymentMethodsSection({
  initialData,
  onUpdate,
}: PaymentMethodsSectionProps) {
  const [formData, setFormData] = useState<PaymentMethods>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation: at least one method must be enabled
    const { cash, card, ewallet } = formData.paymentMethods;
    if (!cash && !card && !ewallet) {
      setError('At least one payment method must be enabled');
      return;
    }

    setIsLoading(true);

    try {
      await ApiClient.put('/settings/restaurant/payments', formData);
      setSuccess('Payment methods updated successfully!');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to update payment methods:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Failed to update settings. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMethod = (method: 'cash' | 'card' | 'ewallet') => {
    setFormData((prev) => ({
      paymentMethods: {
        ...prev.paymentMethods,
        [method]: !prev.paymentMethods[method],
      },
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-5">
        <CreditCard className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">
          Accepted Payment Methods
        </h2>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-red-100">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 text-green-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-green-100">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div>
            <span className="text-sm font-medium text-gray-900">Cash</span>
            <p className="text-xs text-gray-500 mt-0.5">Accept cash payments</p>
          </div>
          <button
            type="button"
            onClick={() => toggleMethod('cash')}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              formData.paymentMethods.cash ? 'bg-green-500' : 'bg-gray-200'
            }`}
            disabled={isLoading}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.paymentMethods.cash ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div>
            <span className="text-sm font-medium text-gray-900">Card</span>
            <p className="text-xs text-gray-500 mt-0.5">
              Accept credit/debit cards
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleMethod('card')}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              formData.paymentMethods.card ? 'bg-green-500' : 'bg-gray-200'
            }`}
            disabled={isLoading}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.paymentMethods.card ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div>
            <span className="text-sm font-medium text-gray-900">E-Wallet</span>
            <p className="text-xs text-gray-500 mt-0.5">
              Accept digital wallet payments
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleMethod('ewallet')}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              formData.paymentMethods.ewallet ? 'bg-green-500' : 'bg-gray-200'
            }`}
            disabled={isLoading}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.paymentMethods.ewallet
                  ? 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="bg-blue-50 rounded-lg p-3 flex items-start gap-2 border border-blue-100">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800">
            At least one payment method must be enabled
          </p>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading || !hasChanges}
            className="w-full md:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
