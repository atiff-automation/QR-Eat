'use client';

import { useEffect, useState } from 'react';
import {
  Settings,
  Save,
  AlertTriangle,
  Shield,
  Globe,
  Mail,
  Key,
} from 'lucide-react';
import Link from 'next/link';
import { ApiClient, ApiClientError } from '@/lib/api-client';

interface PlatformSettings {
  general: {
    platformName: string;
    supportEmail: string;
    maxRestaurantsPerOwner: number;
    defaultCurrency: string;
    maintenanceMode: boolean;
  };
  security: {
    passwordMinLength: number;
    requireMFA: boolean;
    sessionTimeout: number;
    maxLoginAttempts: number;
  };
  features: {
    allowRegistration: boolean;
    allowReservations: boolean;
    allowPayments: boolean;
    allowAnalytics: boolean;
  };
  notifications: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
  };
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await ApiClient.get<{ settings: PlatformSettings }>('/admin/settings');
      setSettings(data.settings);
    } catch {
      console.error('Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    section: string,
    field: string,
    value: string | number | boolean
  ) => {
    if (!settings) return;

    setSettings((prev) => ({
      ...prev!,
      [section]: {
        ...prev![section as keyof PlatformSettings],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setMessage('');

    try {
      await ApiClient.put<{ error?: string }>('/admin/settings', settings);
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'Network error. Please try again.';
      setMessage(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Failed to load settings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Platform Settings
              </h1>
              <p className="text-sm text-gray-500">
                Configure platform-wide settings and preferences
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center disabled:opacity-50"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <Link href="/admin/dashboard">
                <button className="text-gray-600 hover:text-gray-900">
                  ← Back to Dashboard
                </button>
              </Link>
            </div>
          </div>
          {message && (
            <div
              className={`mt-4 p-3 rounded-lg ${
                message.includes('successfully')
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {message}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* General Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-6">
            <Globe className="h-5 w-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">
              General Settings
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platform Name
              </label>
              <input
                type="text"
                value={settings.general.platformName}
                onChange={(e) =>
                  handleInputChange('general', 'platformName', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Support Email
              </label>
              <input
                type="email"
                value={settings.general.supportEmail}
                onChange={(e) =>
                  handleInputChange('general', 'supportEmail', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Restaurants per Owner
              </label>
              <input
                type="number"
                value={settings.general.maxRestaurantsPerOwner}
                onChange={(e) =>
                  handleInputChange(
                    'general',
                    'maxRestaurantsPerOwner',
                    parseInt(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Currency
              </label>
              <select
                value={settings.general.defaultCurrency}
                onChange={(e) =>
                  handleInputChange(
                    'general',
                    'defaultCurrency',
                    e.target.value
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="CAD">CAD - Canadian Dollar</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.general.maintenanceMode}
                  onChange={(e) =>
                    handleInputChange(
                      'general',
                      'maintenanceMode',
                      e.target.checked
                    )
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Maintenance Mode (Disable public access)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-6">
            <Shield className="h-5 w-5 text-red-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">
              Security Settings
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Password Length
              </label>
              <input
                type="number"
                min="6"
                max="128"
                value={settings.security.passwordMinLength}
                onChange={(e) =>
                  handleInputChange(
                    'security',
                    'passwordMinLength',
                    parseInt(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Timeout (minutes)
              </label>
              <input
                type="number"
                min="5"
                max="1440"
                value={settings.security.sessionTimeout}
                onChange={(e) =>
                  handleInputChange(
                    'security',
                    'sessionTimeout',
                    parseInt(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Login Attempts
              </label>
              <input
                type="number"
                min="3"
                max="10"
                value={settings.security.maxLoginAttempts}
                onChange={(e) =>
                  handleInputChange(
                    'security',
                    'maxLoginAttempts',
                    parseInt(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.security.requireMFA}
                onChange={(e) =>
                  handleInputChange('security', 'requireMFA', e.target.checked)
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-900">
                Require Multi-Factor Authentication
              </label>
            </div>
          </div>
        </div>

        {/* Feature Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-6">
            <Key className="h-5 w-5 text-green-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">
              Feature Settings
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.features.allowRegistration}
                  onChange={(e) =>
                    handleInputChange(
                      'features',
                      'allowRegistration',
                      e.target.checked
                    )
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Allow New Restaurant Registration
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.features.allowReservations}
                  onChange={(e) =>
                    handleInputChange(
                      'features',
                      'allowReservations',
                      e.target.checked
                    )
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Enable Reservation System
                </label>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.features.allowPayments}
                  onChange={(e) =>
                    handleInputChange(
                      'features',
                      'allowPayments',
                      e.target.checked
                    )
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Enable Payment Processing
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.features.allowAnalytics}
                  onChange={(e) =>
                    handleInputChange(
                      'features',
                      'allowAnalytics',
                      e.target.checked
                    )
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Enable Analytics Dashboard
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-6">
            <Mail className="h-5 w-5 text-purple-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">
              Notification Settings
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.notifications.emailNotifications}
                onChange={(e) =>
                  handleInputChange(
                    'notifications',
                    'emailNotifications',
                    e.target.checked
                  )
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-900">
                Email Notifications
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.notifications.smsNotifications}
                onChange={(e) =>
                  handleInputChange(
                    'notifications',
                    'smsNotifications',
                    e.target.checked
                  )
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-900">
                SMS Notifications
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.notifications.pushNotifications}
                onChange={(e) =>
                  handleInputChange(
                    'notifications',
                    'pushNotifications',
                    e.target.checked
                  )
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-900">
                Push Notifications
              </label>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">Danger Zone</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            These actions are irreversible. Please be careful.
          </p>
          <div className="flex space-x-4">
            <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">
              Clear All Analytics Data
            </button>
            <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">
              Reset Platform Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
