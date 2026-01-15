/**
 * System Preferences Settings Section
 * Date format, time format, language
 */

'use client';

import { useState } from 'react';
import { useUpdateRestaurantSettings } from '@/lib/hooks/queries/useRestaurantSettings';
import { AlertTriangle, CheckCircle, Settings2 } from 'lucide-react';

interface SystemPreferences {
  systemPreferences: {
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    timeFormat: '12h' | '24h';
    language: 'en' | 'ms' | 'zh';
  };
}

interface SystemPreferencesSectionProps {
  initialData: SystemPreferences;
  onUpdate: () => void;
}

export function SystemPreferencesSection({
  initialData,
  onUpdate,
}: SystemPreferencesSectionProps) {
  const [formData, setFormData] = useState<SystemPreferences>(initialData);
  // isLoading is derived from mutation
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialData);

  const updateSettingsMutation = useUpdateRestaurantSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    // setIsLoading(true); // Derived from mutation

    try {
      await updateSettingsMutation.mutateAsync(formData);

      setSuccess('System preferences updated successfully!');
      if (onUpdate) onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to update system preferences:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update settings. Please try again.';
      setError(message);
    }
  };

  const isLoading = updateSettingsMutation.isPending;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-5">
        <Settings2 className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">System Preferences</h2>
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
            Date Format
          </label>
          <select
            value={formData.systemPreferences.dateFormat}
            onChange={(e) =>
              setFormData((prev) => ({
                systemPreferences: {
                  ...prev.systemPreferences,
                  dateFormat: e.target
                    .value as SystemPreferences['systemPreferences']['dateFormat'],
                },
              }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            disabled={isLoading}
          >
            <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Time Format
          </label>
          <select
            value={formData.systemPreferences.timeFormat}
            onChange={(e) =>
              setFormData((prev) => ({
                systemPreferences: {
                  ...prev.systemPreferences,
                  timeFormat: e.target
                    .value as SystemPreferences['systemPreferences']['timeFormat'],
                },
              }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            disabled={isLoading}
          >
            <option value="12h">12-hour (3:30 PM)</option>
            <option value="24h">24-hour (15:30)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Language
          </label>
          <select
            value={formData.systemPreferences.language}
            onChange={(e) =>
              setFormData((prev) => ({
                systemPreferences: {
                  ...prev.systemPreferences,
                  language: e.target
                    .value as SystemPreferences['systemPreferences']['language'],
                },
              }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            disabled={isLoading}
          >
            <option value="en">English</option>
            <option value="ms">Bahasa Malaysia</option>
            <option value="zh">中文 (Chinese)</option>
          </select>
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
