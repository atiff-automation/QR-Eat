'use client';

import { useState, useEffect } from 'react';
import { PaymentMethod, PaymentConfig } from '@/types/payment';
import { getPaymentMethodIcon, getPaymentMethodName } from '@/lib/payment-utils';
import { Button } from '@/components/ui/Button';

interface PaymentMethodSelectorProps {
  restaurantId: string;
  selectedMethod: string | null;
  onMethodSelect: (methodId: string) => void;
}

export function PaymentMethodSelector({
  restaurantId,
  selectedMethod,
  onMethodSelect,
}: PaymentMethodSelectorProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPaymentMethods();
  }, [restaurantId]);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch(`/api/payment/methods?restaurantId=${restaurantId}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to load payment methods');
        return;
      }

      setPaymentMethods(data.paymentMethods);
      setConfig(data.config);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-gray-600">Loading payment methods...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-red-600 mb-2">{error}</p>
        <Button onClick={fetchPaymentMethods} variant="outline" size="sm">
          Try Again
        </Button>
      </div>
    );
  }

  const enabledMethods = paymentMethods.filter(method => method.enabled);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Payment Method</h3>
      
      <div className="grid grid-cols-1 gap-3">
        {enabledMethods.map((method) => (
          <button
            key={method.id}
            onClick={() => onMethodSelect(method.id)}
            className={`p-4 border-2 rounded-lg text-left transition-all hover:border-blue-300 ${
              selectedMethod === method.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="text-2xl">
                {getPaymentMethodIcon(method.type)}
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{method.name}</h4>
                {method.description && (
                  <p className="text-sm text-gray-600">{method.description}</p>
                )}
              </div>
              {selectedMethod === method.id && (
                <div className="text-blue-500">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {enabledMethods.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No payment methods available</p>
          <p className="text-sm">Please contact staff for assistance</p>
        </div>
      )}

      {config && config.allowTips && (
        <div className="text-xs text-gray-500 mt-4">
          💡 You can add a tip in the next step
        </div>
      )}
    </div>
  );
}