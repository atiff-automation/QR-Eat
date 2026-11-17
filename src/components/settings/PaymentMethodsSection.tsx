/**
 * Payment Methods Settings Section
 * Cash, Card, E-Wallet toggles plus the cash rounding policy.
 *
 * Cash rounding lives on restaurant payment settings (§18.20.14 H), not on
 * loyalty settings, and applies whether rewards are enabled or not. The PUT
 * sends a fresh `Idempotency-Key`; the server audits the change.
 */

'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, CreditCard, Info } from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type CashRounding = 'NONE' | 'NEAREST_5_SEN';

interface PaymentMethods {
  cash: boolean;
  card: boolean;
  ewallet: boolean;
}

interface PaymentSettingsData {
  paymentMethods: PaymentMethods;
  cashRounding: CashRounding;
}

interface PaymentMethodsSectionProps {
  initialData: {
    paymentMethods: PaymentMethods;
    cashRounding?: CashRounding;
  };
  onUpdate: () => void;
}

export function PaymentMethodsSection({
  initialData,
  onUpdate,
}: PaymentMethodsSectionProps) {
  const [formData, setFormData] = useState<PaymentSettingsData>({
    paymentMethods: initialData.paymentMethods,
    cashRounding: initialData.cashRounding ?? 'NONE',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const queryClient = useQueryClient();

  const paymentSettingsQuery = useQuery({
    queryKey: queryKeys.restaurants.paymentSettings,
    queryFn: async () => {
      const data = await ApiClient.get<{
        restaurant: PaymentSettingsData;
      }>('/settings/restaurant/payments');
      return data.restaurant;
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (paymentSettingsQuery.data) {
      setFormData((prev) => ({
        ...prev,
        cashRounding: paymentSettingsQuery.data.cashRounding,
      }));
    }
  }, [paymentSettingsQuery.data]);

  const mutation = useMutation({
    mutationFn: async (payload: PaymentSettingsData) => {
      return ApiClient.put('/settings/restaurant/payments', payload, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.restaurants.paymentSettings,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.restaurants.settings,
      });
      setSuccess('Payment settings updated successfully!');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update settings. Please try again.'
      );
    },
  });

  const baseline: PaymentSettingsData = {
    paymentMethods: initialData.paymentMethods,
    cashRounding:
      paymentSettingsQuery.data?.cashRounding ??
      initialData.cashRounding ??
      'NONE',
  };
  const hasChanges = JSON.stringify(formData) !== JSON.stringify(baseline);

  if (paymentSettingsQuery.isLoading) {
    return <LoadingSpinner size="sm" message="Loading payment settings..." />;
  }

  if (paymentSettingsQuery.isError) {
    return (
      <div className="rounded-xl border border-red-100 bg-white p-5 shadow-sm">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            {paymentSettingsQuery.error instanceof Error
              ? paymentSettingsQuery.error.message
              : 'Could not load payment settings.'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => paymentSettingsQuery.refetch()}
          className="mt-3 min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Retry
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const { cash, card, ewallet } = formData.paymentMethods;
    if (!cash && !card && !ewallet) {
      setError('At least one payment method must be enabled');
      return;
    }

    try {
      await mutation.mutateAsync(formData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update settings. Please try again.'
      );
    }
  };

  const isLoading = mutation.isPending;

  const toggleMethod = (method: keyof PaymentMethods) => {
    setFormData((prev) => ({
      ...prev,
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
        <div
          role="alert"
          className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-red-100"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="mb-4 bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-green-100"
        >
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
            aria-pressed={formData.paymentMethods.cash}
            aria-label="Accept cash payments"
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
            aria-pressed={formData.paymentMethods.card}
            aria-label="Accept card payments"
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
            aria-pressed={formData.paymentMethods.ewallet}
            aria-label="Accept e-wallet payments"
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

        <fieldset className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <legend className="px-1 text-sm font-medium text-gray-900">
            Cash rounding
          </legend>
          <p className="mt-1 text-xs text-gray-500">
            Applies to cash payments only. Card and E-Wallet charge the exact
            total. This is independent of rewards.
          </p>
          <div className="mt-2 space-y-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg bg-white p-3 text-sm text-gray-900">
              <input
                type="radio"
                name="cashRounding"
                value="NONE"
                checked={formData.cashRounding === 'NONE'}
                onChange={() =>
                  setFormData((prev) => ({ ...prev, cashRounding: 'NONE' }))
                }
                className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <span>
                <span className="block font-medium">No rounding</span>
                <span className="block text-xs text-gray-500">
                  Collect the exact total in cash.
                </span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg bg-white p-3 text-sm text-gray-900">
              <input
                type="radio"
                name="cashRounding"
                value="NEAREST_5_SEN"
                checked={formData.cashRounding === 'NEAREST_5_SEN'}
                onChange={() =>
                  setFormData((prev) => ({
                    ...prev,
                    cashRounding: 'NEAREST_5_SEN',
                  }))
                }
                className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <span>
                <span className="block font-medium">
                  Round cash to nearest 5 sen
                </span>
                <span className="block text-xs text-gray-500">
                  The rounding adjustment is shown on the bill and Z report.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

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
            className="min-h-11 w-full rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
