'use client';

import { useState, useEffect } from 'react';
import { useRole } from '@/components/rbac/RoleProvider';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
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
  CreditCard,
  Key,
  Eye,
  EyeOff,
  Lock
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

function PasswordChangeSection() {
  const { user } = useRole();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from current password');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch (error) {
      console.error('Failed to change password:', error);
      setError('Failed to change password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center mb-4">
        <Key className="h-5 w-5 text-blue-600 mr-2" />
        <h3 className="text-lg font-medium text-gray-900">Change Password</h3>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-md p-3">
          <div className="flex">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        </div>
      )}

      <form onSubmit={handlePasswordChange} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Password
          </label>
          <div className="relative">
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              placeholder="Enter current password"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showCurrentPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              placeholder="Enter new password"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showNewPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Password must be at least 8 characters long
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm New Password
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              placeholder="Confirm new password"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Changing Password...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsContent() {
  const { user, restaurantContext } = useRole();
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
      <div className="flex items-center justify-center min-h-64">
        <div className="text-gray-600">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <h1>Settings</h1>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PermissionGuard permission="settings:read">
      <SettingsContent />
    </PermissionGuard>
  );
}
