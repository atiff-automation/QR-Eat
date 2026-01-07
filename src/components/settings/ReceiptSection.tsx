/**
 * Receipt Settings Section
 * Header text, footer text, paper size
 */

'use client';

import { useState } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AlertTriangle, CheckCircle, Receipt } from 'lucide-react';

interface ReceiptSettings {
  receiptSettings: {
    headerText: string;
    footerText: string;
    paperSize: '80mm';
  };
}

interface ReceiptSectionProps {
  initialData: ReceiptSettings;
  onUpdate: () => void;
}

export function ReceiptSection({ initialData, onUpdate }: ReceiptSectionProps) {
  const [formData, setFormData] = useState<ReceiptSettings>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      await ApiClient.put('/settings/restaurant/receipt', formData);
      setSuccess('Receipt settings updated successfully!');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to update receipt settings:', error);
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
        <Receipt className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">
          Receipt Customization
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
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Header Text
          </label>
          <input
            type="text"
            value={formData.receiptSettings.headerText}
            onChange={(e) =>
              setFormData((prev) => ({
                receiptSettings: {
                  ...prev.receiptSettings,
                  headerText: e.target.value,
                },
              }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            placeholder="Welcome to Our Restaurant"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Appears at the top of printed receipts
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Footer Text
          </label>
          <input
            type="text"
            value={formData.receiptSettings.footerText}
            onChange={(e) =>
              setFormData((prev) => ({
                receiptSettings: {
                  ...prev.receiptSettings,
                  footerText: e.target.value,
                },
              }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            placeholder="Thank you for your visit!"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Appears at the bottom of printed receipts
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Paper Size
          </label>
          <select
            value={formData.receiptSettings.paperSize}
            className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg outline-none font-medium text-gray-500 cursor-not-allowed"
            disabled
          >
            <option value="80mm">80mm (Standard)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Fixed at 80mm for thermal printers
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
