'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Home, Search } from 'lucide-react';

function RestaurantNotFoundContent() {
  const searchParams = useSearchParams();
  const [subdomain, setSubdomain] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setSubdomain(searchParams.get('subdomain') || '');
    setError(searchParams.get('error') || 'Restaurant not found');
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Restaurant Not Found
        </h1>

        {subdomain && (
          <div className="bg-gray-100 rounded-md p-3 mb-4">
            <p className="text-sm text-gray-600">
              Looking for:{' '}
              <span className="font-mono font-semibold">{subdomain}</span>
            </p>
          </div>
        )}

        <p className="text-gray-600 mb-6">
          {error === 'Restaurant not found'
            ? "We couldn't find a restaurant with this address. It may have been moved, renamed, or temporarily unavailable."
            : error}
        </p>

        <div className="space-y-3">
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Go to Main Site
          </Link>

          <Link
            href="/restaurants"
            className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <Search className="w-4 h-4 mr-2" />
            Browse All Restaurants
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            If you think this is an error, please contact the restaurant
            directly or
            <Link
              href="/contact"
              className="text-blue-600 hover:text-blue-500 ml-1"
            >
              contact our support team
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Additional Help Section */}
      <div className="mt-8 max-w-md w-full">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Looking for a specific restaurant?
          </h3>
          <p className="text-sm text-blue-700">
            Restaurant URLs follow the format: <br />
            <span className="font-mono bg-blue-100 px-2 py-1 rounded text-xs">
              restaurant-name.tabtep.app
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantNotFoundPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <RestaurantNotFoundContent />
    </Suspense>
  );
}
