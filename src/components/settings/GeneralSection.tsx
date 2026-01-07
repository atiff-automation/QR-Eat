/**
 * General Information Settings Section
 * Restaurant name, address, phone, email
 */

'use client';

import { useState } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AlertTriangle, CheckCircle, Building2 } from 'lucide-react';

interface GeneralInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
}

interface GeneralSectionProps {
  initialData: GeneralInfo;
  onUpdate: () => void;
}

export function GeneralSection({ initialData, onUpdate }: GeneralSectionProps) {
  const [formData, setFormData] = useState<GeneralInfo>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (
      !formData.name ||
      !formData.address ||
      !formData.phone ||
      !formData.email
    ) {
      setError('Please fill in all required fields');
      return;
    }

    setIsLoading(true);

    try {
      await ApiClient.put('/settings/restaurant/general', formData);
      setSuccess('General information updated successfully!');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to update general information:', error);
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
        <Building2 className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">General Information</h2>
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
            Restaurant Name *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            placeholder="My Restaurant"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Address *
          </label>
          <input
            type="text"
            required
            value={formData.address}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, address: e.target.value }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            placeholder="123 Main Street, City"
            disabled={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Phone Number *
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, phone: e.target.value }))
              }
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
              placeholder="+60 12-345 6789"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
              placeholder="contact@restaurant.com"
              disabled={isLoading}
            />
          </div>
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
