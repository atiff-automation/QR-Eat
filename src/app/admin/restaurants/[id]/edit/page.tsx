'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Save, 
  ArrowLeft,
  Building2,
  User,
  MapPin,
  Phone,
  Mail,
  Globe,
  Clock,
  DollarSign
} from 'lucide-react';
import Link from 'next/link';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  isActive: boolean;
  currency: string;
  timezone: string;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  settings: {
    acceptReservations: boolean;
    maxReservationDays: number;
    reservationTimeSlots: number;
    autoConfirmReservations: boolean;
  };
}

export default function EditRestaurantPage() {
  const params = useParams();
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (params.id) {
      fetchRestaurant(params.id as string);
    }
  }, [params.id]);

  const getAuthToken = () => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      // Check for all possible auth cookie types
      const authCookie = cookies.find((cookie) => {
        const trimmed = cookie.trim();
        return trimmed.startsWith('qr_auth_token=') ||
               trimmed.startsWith('qr_owner_token=') ||
               trimmed.startsWith('qr_staff_token=') ||
               trimmed.startsWith('qr_admin_token=');
      });
      if (authCookie) {
        return authCookie.split('=')[1];
      }
    }
    return '';
  };

  const fetchRestaurant = async (id: string) => {
    try {
      const response = await fetch(`/api/restaurants/${id}?includeSettings=true`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setRestaurant(data.restaurant);
      } else {
        setMessage('Failed to load restaurant');
      }
    } catch (error) {
      console.error('Failed to fetch restaurant:', error);
      setMessage('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    if (!restaurant) return;
    
    setRestaurant(prev => ({
      ...prev!,
      [field]: value
    }));
  };

  const handleOwnerChange = (field: string, value: any) => {
    if (!restaurant) return;
    
    setRestaurant(prev => ({
      ...prev!,
      owner: {
        ...prev!.owner,
        [field]: value
      }
    }));
  };

  const handleSettingsChange = (field: string, value: any) => {
    if (!restaurant) return;
    
    setRestaurant(prev => ({
      ...prev!,
      settings: {
        ...prev!.settings,
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!restaurant) return;
    
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch(`/api/restaurants/${restaurant.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          name: restaurant.name,
          slug: restaurant.slug,
          description: restaurant.description,
          address: restaurant.address,
          phone: restaurant.phone,
          email: restaurant.email,
          website: restaurant.website,
          isActive: restaurant.isActive,
          currency: restaurant.currency,
          timezone: restaurant.timezone,
          owner: restaurant.owner,
          settings: restaurant.settings
        }),
      });

      if (response.ok) {
        setMessage('Restaurant updated successfully!');
        setTimeout(() => {
          router.push('/admin/restaurants');
        }, 1500);
      } else {
        const data = await response.json();
        setMessage(data.error || 'Failed to update restaurant');
      }
    } catch (error) {
      setMessage('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading restaurant...</p>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Restaurant not found</p>
          <Link href="/admin/restaurants" className="text-blue-600 hover:underline mt-2 inline-block">
            ← Back to Restaurants
          </Link>
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
              <h1 className="text-2xl font-bold text-gray-900">Edit Restaurant</h1>
              <p className="text-sm text-gray-500">Update restaurant information and settings</p>
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
              <Link href="/admin/restaurants">
                <button className="text-gray-600 hover:text-gray-900 flex items-center">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to Restaurants
                </button>
              </Link>
            </div>
          </div>
          {message && (
            <div className={`mt-4 p-3 rounded-lg ${
              message.includes('successfully') 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Restaurant Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-6">
            <Building2 className="h-5 w-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">Restaurant Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Restaurant Name *
              </label>
              <input
                type="text"
                value={restaurant.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL Slug *
              </label>
              <input
                type="text"
                value={restaurant.slug}
                onChange={(e) => handleInputChange('slug', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="restaurant-name"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                rows={3}
                value={restaurant.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Brief description of the restaurant"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="h-4 w-4 inline mr-1" />
                Address *
              </label>
              <input
                type="text"
                value={restaurant.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="h-4 w-4 inline mr-1" />
                Phone Number *
              </label>
              <input
                type="tel"
                value={restaurant.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="h-4 w-4 inline mr-1" />
                Email Address *
              </label>
              <input
                type="email"
                value={restaurant.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Globe className="h-4 w-4 inline mr-1" />
                Website
              </label>
              <input
                type="url"
                value={restaurant.website || ''}
                onChange={(e) => handleInputChange('website', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://restaurant-website.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="h-4 w-4 inline mr-1" />
                Currency
              </label>
              <select
                value={restaurant.currency}
                onChange={(e) => handleInputChange('currency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="CAD">CAD - Canadian Dollar</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="h-4 w-4 inline mr-1" />
                Timezone
              </label>
              <select
                value={restaurant.timezone}
                onChange={(e) => handleInputChange('timezone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={restaurant.isActive}
                  onChange={(e) => handleInputChange('isActive', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Restaurant is active and accepting orders
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Owner Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-6">
            <User className="h-5 w-5 text-purple-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">Owner Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name *
              </label>
              <input
                type="text"
                value={restaurant.owner.firstName}
                onChange={(e) => handleOwnerChange('firstName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name *
              </label>
              <input
                type="text"
                value={restaurant.owner.lastName}
                onChange={(e) => handleOwnerChange('lastName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                value={restaurant.owner.email}
                onChange={(e) => handleOwnerChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={restaurant.owner.phone || ''}
                onChange={(e) => handleOwnerChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Restaurant Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-6">
            <Clock className="h-5 w-5 text-green-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">Restaurant Settings</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={restaurant.settings.acceptReservations}
                  onChange={(e) => handleSettingsChange('acceptReservations', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Accept table reservations
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={restaurant.settings.autoConfirmReservations}
                  onChange={(e) => handleSettingsChange('autoConfirmReservations', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Auto-confirm reservations
                </label>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max reservation days ahead
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={restaurant.settings.maxReservationDays}
                  onChange={(e) => handleSettingsChange('maxReservationDays', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reservation time slots (minutes)
                </label>
                <select
                  value={restaurant.settings.reservationTimeSlots}
                  onChange={(e) => handleSettingsChange('reservationTimeSlots', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}