/**
 * Notification Settings Section
 * Order alerts, sounds, desktop notifications
 */

'use client';

import { useState, useEffect } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import {
  AlertTriangle,
  CheckCircle,
  Bell,
  Smartphone,
  Info,
} from 'lucide-react';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';

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

  // Push notification hook
  const pushNotifications = usePushNotifications();

  // iOS detection
  const [isIOS, setIsIOS] = useState(false);
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);

  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Detect if PWA is installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsPWAInstalled(standalone);
  }, []);

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

  const handleTestNotification = async () => {
    try {
      if (!pushNotifications.isSubscribed) {
        setError('Please enable push notifications first');
        return;
      }

      // Show a test notification using the Notifications API
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Test Notification', {
          body: 'Push notifications are working! 🎉',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
        });
        setSuccess('Test notification sent!');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      setError('Failed to send test notification');
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

        {/* Push Notifications Section */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Smartphone className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">
              Push Notifications
            </h3>
          </div>

          {/* iOS PWA Install Prompt */}
          {isIOS && !isPWAInstalled && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900 mb-2">
                    Install App for Push Notifications
                  </p>
                  <p className="text-xs text-amber-700 mb-3">
                    On iOS, push notifications only work when the app is
                    installed to your home screen:
                  </p>
                  <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
                    <li>Tap the Share button in Safari</li>
                    <li>Select &quot;Add to Home Screen&quot;</li>
                    <li>Open the app from your home screen</li>
                    <li>Return here to enable notifications</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Push Notification Support Check */}
          {!pushNotifications.isSupported ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                Push notifications are not supported in this browser.
              </p>
            </div>
          ) : (
            <>
              {/* Permission Status */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      Permission Status
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {pushNotifications.permission === 'granted' &&
                        'Notifications allowed'}
                      {pushNotifications.permission === 'denied' &&
                        'Notifications blocked - Enable in browser settings'}
                      {pushNotifications.permission === 'default' &&
                        'Not requested yet'}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      pushNotifications.permission === 'granted'
                        ? 'bg-green-100 text-green-700'
                        : pushNotifications.permission === 'denied'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {pushNotifications.permission === 'granted' && 'Granted'}
                    {pushNotifications.permission === 'denied' && 'Denied'}
                    {pushNotifications.permission === 'default' && 'Not Set'}
                  </span>
                </div>
              </div>

              {/* Enable/Disable Push Notifications */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      Enable Push Notifications
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isIOS
                        ? 'Receive notifications (system sound only on iOS)'
                        : 'Receive notifications with custom sounds'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (pushNotifications.isSubscribed) {
                        pushNotifications.unsubscribe();
                      } else {
                        pushNotifications.subscribe();
                      }
                    }}
                    disabled={
                      pushNotifications.isLoading ||
                      pushNotifications.permission === 'denied'
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      pushNotifications.isSubscribed
                        ? 'bg-green-500'
                        : 'bg-gray-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        pushNotifications.isSubscribed
                          ? 'translate-x-5'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Test Notification Button */}
              {pushNotifications.isSubscribed && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors border border-gray-200"
                  >
                    Send Test Notification
                  </button>
                </div>
              )}

              {/* Push Notification Error */}
              {pushNotifications.error && (
                <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {pushNotifications.error}
                </div>
              )}

              {/* Platform-specific Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  <strong>Note:</strong>{' '}
                  {isIOS
                    ? 'iOS uses system notification sounds. Custom sounds are not supported.'
                    : 'Android supports custom notification sounds configured above.'}
                </p>
              </div>
            </>
          )}
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
