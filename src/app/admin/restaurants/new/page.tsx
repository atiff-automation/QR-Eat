'use client';

import { useState } from 'react';
import { ArrowLeft, Save, CheckCircle, Building2, Plus } from 'lucide-react';
import Link from 'next/link';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import CredentialsModal from '@/components/CredentialsModal';

interface CreatedRestaurantResponse {
  message: string;
  restaurant: {
    name: string;
    slug: string;
  };
  owner: {
    email: string;
    tempPassword: string;
  };
}

export default function NewRestaurantPage() {
  const [formData, setFormData] = useState({
    // Restaurant information (3 fields)
    name: '',
    slug: '',
    address: '',
    // Owner information (3 fields)
    ownerFirstName: '',
    ownerLastName: '',
    ownerEmail: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [createdRestaurant, setCreatedRestaurant] =
    useState<CreatedRestaurantResponse | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({ ...prev, [name]: value }));

    // Auto-generate slug from name
    if (name === 'name') {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setFormData((prev) => ({ ...prev, slug }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await ApiClient.post<CreatedRestaurantResponse>(
        '/admin/restaurants',
        formData
      );

      setSuccess(true);
      setCreatedRestaurant(data);
      setShowCredentialsModal(true);
      setError('');
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCredentialsModal = () => {
    setShowCredentialsModal(false);
  };

  const handleAddAnother = () => {
    setSuccess(false);
    setCreatedRestaurant(null);
    setShowCredentialsModal(false);
    setFormData({
      name: '',
      slug: '',
      address: '',
      ownerFirstName: '',
      ownerLastName: '',
      ownerEmail: '',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Link href="/admin/restaurants">
                <button className="text-gray-600 hover:text-gray-900 mr-4">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Add New Restaurant
                </h1>
                <p className="text-sm text-gray-500">
                  Create a new restaurant and owner account
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {success && createdRestaurant ? (
          <div className="max-w-4xl mx-auto">
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
              <div className="flex items-center mb-4">
                <CheckCircle className="h-6 w-6 text-green-600 mr-2" />
                <h2 className="text-lg font-semibold text-green-800">
                  Restaurant Created Successfully!
                </h2>
              </div>
              <p className="text-green-700 mb-4">{createdRestaurant.message}</p>

              <div className="bg-white p-4 rounded-lg border border-green-200 mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Restaurant Details:
                </h3>
                <p>
                  <strong>Name:</strong> {createdRestaurant.restaurant.name}
                </p>
                <p>
                  <strong>Slug:</strong> {createdRestaurant.restaurant.slug}
                </p>
              </div>

              <div className="flex space-x-4">
                <Link
                  href="/admin/restaurants"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg inline-flex items-center"
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Back to Restaurants
                </Link>
                <button
                  onClick={handleAddAnother}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg inline-flex items-center"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Restaurant
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-8">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600">{error}</p>
              </div>
            )}

            {/* Restaurant Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                Restaurant Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Restaurant Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL Slug *
                  </label>
                  <input
                    type="text"
                    name="slug"
                    value={formData.slug}
                    onChange={handleInputChange}
                    required
                    pattern="^[a-z0-9\-]+$"
                    title="Only lowercase letters, numbers, and hyphens are allowed"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Will be used for: {formData.slug}.yourdomain.com
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address *
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  ℹ️ Additional settings (timezone, currency, tax rates, etc.)
                  will use Malaysian defaults and can be configured later in the
                  restaurant settings.
                </p>
              </div>
            </div>

            {/* Owner Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                Owner Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="ownerFirstName"
                    value={formData.ownerFirstName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="ownerLastName"
                    value={formData.ownerLastName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email * (Login Credential)
                  </label>
                  <input
                    type="email"
                    name="ownerEmail"
                    value={formData.ownerEmail}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This will be used as the login email for the restaurant
                    owner
                  </p>
                </div>
              </div>
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  🔑 A temporary password will be auto-generated and displayed
                  after creation. The owner must change it on first login.
                </p>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end">
              <Link href="/admin/restaurants">
                <button
                  type="button"
                  className="mr-4 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {loading ? 'Creating...' : 'Create Restaurant'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Credentials Modal */}
      {showCredentialsModal && createdRestaurant && (
        <CredentialsModal
          isOpen={showCredentialsModal}
          credentials={{
            username: createdRestaurant.owner.email,
            password: createdRestaurant.owner.tempPassword,
          }}
          staffName={createdRestaurant.restaurant.name}
          staffEmail={createdRestaurant.owner.email}
          onClose={handleCloseCredentialsModal}
        />
      )}
    </div>
  );
}
