/**
 * Financial Settings Section
 * Currency, tax rate, service charge, labels
 */

'use client';

import { useState } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AlertTriangle, CheckCircle, DollarSign } from 'lucide-react';

interface FinancialSettings {
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  taxLabel: string;
  serviceChargeLabel: string;
}

interface FinancialSectionProps {
  initialData: FinancialSettings;
  onUpdate: () => void;
}

const CURRENCIES = [
  { code: 'MYR', name: 'Malaysian Ringgit (MYR)' },
  { code: 'USD', name: 'US Dollar (USD)' },
  { code: 'SGD', name: 'Singapore Dollar (SGD)' },
  { code: 'EUR', name: 'Euro (EUR)' },
  { code: 'GBP', name: 'British Pound (GBP)' },
  { code: 'AUD', name: 'Australian Dollar (AUD)' },
  { code: 'CAD', name: 'Canadian Dollar (CAD)' },
  { code: 'JPY', name: 'Japanese Yen (JPY)' },
  { code: 'CNY', name: 'Chinese Yuan (CNY)' },
  { code: 'HKD', name: 'Hong Kong Dollar (HKD)' },
  { code: 'INR', name: 'Indian Rupee (INR)' },
  { code: 'IDR', name: 'Indonesian Rupiah (IDR)' },
  { code: 'THB', name: 'Thai Baht (THB)' },
  { code: 'PHP', name: 'Philippine Peso (PHP)' },
  { code: 'VND', name: 'Vietnamese Dong (VND)' },
  { code: 'KRW', name: 'South Korean Won (KRW)' },
  { code: 'NZD', name: 'New Zealand Dollar (NZD)' },
  { code: 'CHF', name: 'Swiss Franc (CHF)' },
];

export function FinancialSection({
  initialData,
  onUpdate,
}: FinancialSectionProps) {
  const [formData, setFormData] = useState<FinancialSettings>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (formData.taxRate < 0 || formData.taxRate > 100) {
      setError('Tax rate must be between 0 and 100');
      return;
    }

    if (formData.serviceChargeRate < 0 || formData.serviceChargeRate > 100) {
      setError('Service charge rate must be between 0 and 100');
      return;
    }

    setIsLoading(true);

    try {
      await ApiClient.put('/settings/restaurant/financial', formData);
      setSuccess('Financial settings updated successfully!');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to update financial settings:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Failed to update settings. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-5">
        <DollarSign className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">Financial Settings</h2>
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
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Currency *
          </label>
          <select
            required
            value={formData.currency}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, currency: e.target.value }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            disabled={isLoading}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Tax Label *
          </label>
          <input
            type="text"
            required
            value={formData.taxLabel}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, taxLabel: e.target.value }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            placeholder="SST (6%)"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            This label will appear on receipts and invoices
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Tax Rate (%) *
          </label>
          <input
            type="number"
            required
            min="0"
            max="100"
            step="0.01"
            value={formData.taxRate}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                taxRate: parseFloat(e.target.value) || 0,
              }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            placeholder="6.00"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Service Charge Label *
          </label>
          <input
            type="text"
            required
            value={formData.serviceChargeLabel}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                serviceChargeLabel: e.target.value,
              }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            placeholder="Service Charge (10%)"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            This label will appear on receipts and invoices
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Service Charge (%) *
          </label>
          <input
            type="number"
            required
            min="0"
            max="100"
            step="0.01"
            value={formData.serviceChargeRate}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                serviceChargeRate: parseFloat(e.target.value) || 0,
              }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            placeholder="10.00"
            disabled={isLoading}
          />
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
