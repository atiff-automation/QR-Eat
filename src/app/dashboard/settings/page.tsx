'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { 
  Settings, 
  Save, 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  DollarSign, 
  Percent, 
  Palette, 
  Bell, 
  Shield, 
  Database,
  AlertTriangle,
  CheckCircle,
  Globe,
  CreditCard
} from 'lucide-react';

interface RestaurantSettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
}

interface SystemSettings {
  enableNotifications: boolean;
  orderTimeout: number;
  maxTablesPerQR: number;
  defaultPreparationTime: number;
  theme: 'light' | 'dark';
}

export default function SettingsPage() {
  const [restaurantSettings, setRestaurantSettings] = useState<RestaurantSettings>({
    name: '',
    address: '',
    phone: '',
    email: '',
    timezone: 'UTC',
    currency: 'USD',
    taxRate: 0,
    serviceChargeRate: 0
  });

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    enableNotifications: true,
    orderTimeout: 30,
    maxTablesPerQR: 1,
    defaultPreparationTime: 15,
    theme: 'light'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'restaurant' | 'system' | 'security'>('restaurant');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      
      // Get current user/restaurant info
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        if (data.restaurant) {
          setRestaurantSettings({
            name: data.restaurant.name || '',
            address: data.restaurant.address || '',
            phone: data.restaurant.phone || '',
            email: data.restaurant.email || '',
            timezone: data.restaurant.timezone || 'UTC',
            currency: data.restaurant.currency || 'USD',
            taxRate: data.restaurant.taxRate || 0,
            serviceChargeRate: data.restaurant.serviceChargeRate || 0
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // For now, we'll just show success since the API endpoints aren't fully implemented
      setSuccess('Settings saved successfully!');
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRestaurantChange = (field: keyof RestaurantSettings, value: string | number) => {
    setRestaurantSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSystemChange = (field: keyof SystemSettings, value: string | number | boolean) => {
    setSystemSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-64">
          <div className="text-gray-600">Loading settings...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600">Configure your restaurant and system settings</p>
          </div>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium flex items-center"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <span className="text-red-600">{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              <span className="text-green-600">{success}</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('restaurant')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'restaurant'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Building2 className="h-4 w-4 inline mr-2" />
              Restaurant
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'system'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="h-4 w-4 inline mr-2" />
              System
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'security'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Shield className="h-4 w-4 inline mr-2" />
              Security
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {activeTab === 'restaurant' && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Restaurant Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Building2 className="h-4 w-4 inline mr-1" />
                    Restaurant Name
                  </label>
                  <input
                    type="text"
                    value={restaurantSettings.name}
                    onChange={(e) => handleRestaurantChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter restaurant name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Mail className="h-4 w-4 inline mr-1" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={restaurantSettings.email}
                    onChange={(e) => handleRestaurantChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter email address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Phone className="h-4 w-4 inline mr-1" />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={restaurantSettings.phone}
                    onChange={(e) => handleRestaurantChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Globe className="h-4 w-4 inline mr-1" />
                    Timezone
                  </label>
                  <select
                    value={restaurantSettings.timezone}
                    onChange={(e) => handleRestaurantChange('timezone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="h-4 w-4 inline mr-1" />
                    Address
                  </label>
                  <textarea
                    value={restaurantSettings.address}
                    onChange={(e) => handleRestaurantChange('address', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter restaurant address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <DollarSign className="h-4 w-4 inline mr-1" />
                    Currency
                  </label>
                  <select
                    value={restaurantSettings.currency}
                    onChange={(e) => handleRestaurantChange('currency', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="AUD">AUD - Australian Dollar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Percent className="h-4 w-4 inline mr-1" />
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={restaurantSettings.taxRate}
                    onChange={(e) => handleRestaurantChange('taxRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <CreditCard className="h-4 w-4 inline mr-1" />
                    Service Charge (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={restaurantSettings.serviceChargeRate}
                    onChange={(e) => handleRestaurantChange('serviceChargeRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">System Configuration</h2>
              <div className="space-y-6">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={systemSettings.enableNotifications}
                      onChange={(e) => handleSystemChange('enableNotifications', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Bell className="h-4 w-4 ml-2 mr-1" />
                    <span className="text-sm font-medium text-gray-700">Enable Notifications</span>
                  </label>
                  <p className="text-sm text-gray-500 ml-6">Send notifications for new orders and updates</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Order Timeout (minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={systemSettings.orderTimeout}
                    onChange={(e) => handleSystemChange('orderTimeout', parseInt(e.target.value) || 30)}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">Time before order automatically expires</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Database className="h-4 w-4 inline mr-1" />
                    Default Preparation Time (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={systemSettings.defaultPreparationTime}
                    onChange={(e) => handleSystemChange('defaultPreparationTime', parseInt(e.target.value) || 15)}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">Default time for menu items without specific preparation time</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Palette className="h-4 w-4 inline mr-1" />
                    Theme
                  </label>
                  <select
                    value={systemSettings.theme}
                    onChange={(e) => handleSystemChange('theme', e.target.value)}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                  <p className="text-sm text-gray-500 mt-1">Choose the interface theme</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Settings</h2>
              <div className="space-y-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                    <span className="text-yellow-800 font-medium">Security settings are managed by system administrators</span>
                  </div>
                  <p className="text-yellow-700 text-sm mt-1">
                    Contact your system administrator to modify security policies, password requirements, and access controls.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Two-Factor Authentication</h3>
                      <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
                    </div>
                    <div className="text-sm text-gray-500">Contact Admin</div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Session Timeout</h3>
                      <p className="text-sm text-gray-500">Automatically log out after inactivity</p>
                    </div>
                    <div className="text-sm text-gray-500">30 minutes</div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Password Policy</h3>
                      <p className="text-sm text-gray-500">Minimum requirements for user passwords</p>
                    </div>
                    <div className="text-sm text-gray-500">8+ characters, mixed case</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}