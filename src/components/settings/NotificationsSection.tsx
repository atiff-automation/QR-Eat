/**
 * Notification Settings Section
 * Order alerts, sounds, desktop notifications
 */

'use client';

import { useState } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AlertTriangle, CheckCircle, Bell } from 'lucide-react';

interface NotificationSettings {
  notificationSettings: {
    orderAlerts: boolean;
    soundEnabled: boolean;
    soundType: 'chime' | 'bell' | 'ding' | 'silent';
    desktopNotifications: boolean;
  };
}

interface NotificationsSectionProps {
  initialData: NotificationSettings;
  onUpdate: () => void;
}

export function NotificationsSection({
  initialData,
  onUpdate,
}: NotificationsSectionProps) {
  const [formData, setFormData] = useState<NotificationSettings>(initialData);
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
      await ApiClient.put('/settings/restaurant/notifications', formData);
      setSuccess('Notification settings updated successfully!');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to update notification settings:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Failed to update settings. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = (
    key: keyof NotificationSettings['notificationSettings'],
    value: boolean | string
  ) => {
    setFormData((prev) => ({
      notificationSettings: {
        ...prev.notificationSettings,
        [key]: value,
      },
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-5">
        <Bell className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">
          Notification Settings
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
            <span className="text-sm font-medium text-gray-900">
              Order Alerts
            </span>
            <p className="text-xs text-gray-500 mt-0.5">
              Receive alerts for new orders
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateSetting(
                'orderAlerts',
                !formData.notificationSettings.orderAlerts
              )
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              formData.notificationSettings.orderAlerts
                ? 'bg-green-500'
                : 'bg-gray-200'
            }`}
            disabled={isLoading}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.notificationSettings.orderAlerts
                  ? 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div>
            <span className="text-sm font-medium text-gray-900">
              Sound Enabled
            </span>
            <p className="text-xs text-gray-500 mt-0.5">
              Play sound for notifications
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateSetting(
                'soundEnabled',
                !formData.notificationSettings.soundEnabled
              )
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              formData.notificationSettings.soundEnabled
                ? 'bg-green-500'
                : 'bg-gray-200'
            }`}
            disabled={isLoading}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.notificationSettings.soundEnabled
                  ? 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {formData.notificationSettings.soundEnabled && (
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Sound Type
            </label>
            <select
              value={formData.notificationSettings.soundType}
              onChange={(e) => updateSetting('soundType', e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
              disabled={isLoading}
            >
              <option value="chime">Chime</option>
              <option value="bell">Bell</option>
              <option value="ding">Ding</option>
              <option value="silent">Silent</option>
            </select>
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div>
            <span className="text-sm font-medium text-gray-900">
              Desktop Notifications
            </span>
            <p className="text-xs text-gray-500 mt-0.5">
              Show browser notifications
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateSetting(
                'desktopNotifications',
                !formData.notificationSettings.desktopNotifications
              )
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              formData.notificationSettings.desktopNotifications
                ? 'bg-green-500'
                : 'bg-gray-200'
            }`}
            disabled={isLoading}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                formData.notificationSettings.desktopNotifications
                  ? 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
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
