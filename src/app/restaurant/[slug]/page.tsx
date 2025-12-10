'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ApiClient, ApiClientError } from '@/lib/api-client';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  businessType: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  galleryImages: string[];
  socialMedia: Record<string, string>;
  operatingHours: Record<string, any>;
  features: string[];
  cuisineTypes: string[];
  priceRange: string;
  showOnDirectory: boolean;
  acceptsReservations: boolean;
  deliveryAvailable: boolean;
  takeoutAvailable: boolean;
}

export default function RestaurantProfilePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (slug) {
      fetchRestaurant();
    }
  }, [slug]);

  const fetchRestaurant = async () => {
    try {
      // Fetch restaurant information by slug
      const response = await ApiClient.get<{ restaurant: Restaurant }>(`/api/restaurants/by-slug/${slug}/public`);
      setRestaurant(response.restaurant);
    } catch (error) {
      console.error('[RestaurantPage] Failed to fetch restaurant:', error);
      if (error instanceof ApiClientError) {
        setError(error.message || 'Restaurant not found');
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-800">Loading restaurant...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-6">
          <AlertTriangle className="h-16 w-16 text-red-600 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Restaurant Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <Button onClick={() => window.location.reload()} className="w-full">
              Try Again
            </Button>
            <Link href="/" className="block">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-800">Restaurant not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="relative bg-white">
        {restaurant.coverImageUrl && (
          <div className="absolute inset-0">
            <img
              src={restaurant.coverImageUrl}
              alt={restaurant.name}
              className="w-full h-full object-cover opacity-10"
            />
          </div>
        )}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            {restaurant.logoUrl && (
              <img
                src={restaurant.logoUrl}
                alt={`${restaurant.name} logo`}
                className="h-20 w-auto mx-auto mb-6"
              />
            )}
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              {restaurant.name}
            </h1>
            {restaurant.description && (
              <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
                {restaurant.description}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              {restaurant.cuisineTypes.map((cuisine) => (
                <span
                  key={cuisine}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                >
                  {cuisine}
                </span>
              ))}
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                {restaurant.priceRange}
              </span>
            </div>
            <div className="flex justify-center space-x-4">
              <Link href="/login">
                <Button variant="outline">
                  Staff Login
                </Button>
              </Link>
              {restaurant.website && (
                <a href={restaurant.website} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">
                    Visit Website
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* QR Code Notice */}
      <section className="bg-blue-600 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to Order?</h2>
          <p className="text-lg mb-4">
            Scan the QR code at your table to view our menu and place your order!
          </p>
          <div className="text-sm opacity-90">
            Digital ordering • No app required • Quick & easy
          </div>
        </div>
      </section>

      {/* Restaurant Info */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact Info */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact & Location</h3>
              <div className="space-y-3">
                {restaurant.address && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Address</p>
                    <p className="text-gray-600">{restaurant.address}</p>
                  </div>
                )}
                {restaurant.phone && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Phone</p>
                    <a href={`tel:${restaurant.phone}`} className="text-blue-600 hover:underline">
                      {restaurant.phone}
                    </a>
                  </div>
                )}
                {restaurant.email && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Email</p>
                    <a href={`mailto:${restaurant.email}`} className="text-blue-600 hover:underline">
                      {restaurant.email}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Features */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Features & Amenities</h3>
              <div className="grid grid-cols-1 gap-2">
                {restaurant.features.map((feature) => (
                  <div key={feature} className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                    {feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                ))}
                {restaurant.deliveryAvailable && (
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                    Delivery Available
                  </div>
                )}
                {restaurant.takeoutAvailable && (
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                    Takeout Available
                  </div>
                )}
                {restaurant.acceptsReservations && (
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                    Accepts Reservations
                  </div>
                )}
              </div>
            </div>

            {/* Social Media */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Follow Us</h3>
              <div className="space-y-3">
                {Object.entries(restaurant.socialMedia).map(([platform, url]) => (
                  url && (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-blue-600 hover:underline"
                    >
                      {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </a>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}