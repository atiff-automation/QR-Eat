import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import {
  Building2,
  Globe,
  Users,
  Shield,
  BarChart3,
  Smartphone,
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="mr-3 relative w-8 h-8">
                <Image
                  src="/icons/icon-192x192.png"
                  alt="Tabtep Logo"
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-semibold text-gray-900">
                Tabtep
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/restaurants"
                className="text-gray-600 hover:text-gray-900"
              >
                Find Restaurant
              </Link>
              <Link
                href="/login"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Tabtep
            <span className="text-blue-600"> SaaS Platform</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Complete multi-tenant restaurant management platform with QR code
            ordering, subdomain isolation, and comprehensive analytics for
            restaurant chains and individual locations.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto">
                Platform Login
              </Button>
            </Link>
            <Link href="/restaurants">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Find Your Restaurant
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Globe className="h-8 w-8 text-blue-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">
                Subdomain Isolation
              </h3>
            </div>
            <p className="text-gray-600">
              Each restaurant gets its own dedicated subdomain for complete
              brand isolation and custom customer experience.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Users className="h-8 w-8 text-green-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">
                Multi-Tenant Users
              </h3>
            </div>
            <p className="text-gray-600">
              Platform admins, restaurant owners, and staff with role-based
              permissions and tenant-specific access control.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Shield className="h-8 w-8 text-red-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">
                Enterprise Security
              </h3>
            </div>
            <p className="text-gray-600">
              Row-level security, JWT authentication, and comprehensive audit
              logging for enterprise-grade security.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Smartphone className="h-8 w-8 text-purple-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">
                QR Code Ordering
              </h3>
            </div>
            <p className="text-gray-600">
              Contactless QR code ordering system with real-time kitchen display
              and order management.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <BarChart3 className="h-8 w-8 text-orange-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">
                Advanced Analytics
              </h3>
            </div>
            <p className="text-gray-600">
              Comprehensive reporting and analytics with tenant-specific data
              isolation and performance metrics.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Building2 className="h-8 w-8 text-indigo-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">
                Restaurant Chains
              </h3>
            </div>
            <p className="text-gray-600">
              Perfect for restaurant chains with centralized owner management
              and individual location control.
            </p>
          </div>
        </div>

        {/* Demo Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
            Live Demo - Multi-Tenant Restaurant System
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Restaurant Examples */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Restaurant Subdomains
              </h3>
              <div className="space-y-3">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="font-medium text-gray-900">
                    Mario&apos;s Authentic Italian
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    Subdomain: marios-authentic-italian
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/qr/marios-authentic-italian"
                      className="text-xs bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded text-blue-700"
                    >
                      Customer Menu
                    </Link>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                      marios-authentic-italian.localhost:3000/dashboard
                    </span>
                  </div>
                </div>

                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="font-medium text-gray-900">
                    Tasty Burger Westside
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    Subdomain: tasty-burger-westside
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/qr/tasty-burger-westside"
                      className="text-xs bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded text-blue-700"
                    >
                      Customer Menu
                    </Link>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                      tasty-burger-westside.localhost:3000/dashboard
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* User Types */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                User Access Types
              </h3>
              <div className="space-y-3">
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-1">
                    Platform Admin
                  </h4>
                  <p className="text-sm text-gray-600">
                    admin@tabtep.com / admin123
                  </p>
                  <p className="text-xs text-purple-700">
                    Access to all restaurants and admin features
                  </p>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-1">
                    Restaurant Owner
                  </h4>
                  <p className="text-sm text-gray-600">
                    mario@rossigroup.com / owner123
                  </p>
                  <p className="text-xs text-blue-700">
                    Manage multiple restaurant locations
                  </p>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-1">
                    Staff Member
                  </h4>
                  <p className="text-sm text-gray-600">
                    mario@marios-authentic.com / staff123
                  </p>
                  <p className="text-xs text-green-700">
                    Access to assigned restaurant only
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600 mb-4">
              <strong>Note:</strong> In development, subdomains can be tested by
              manually entering URLs like
              <code className="bg-gray-100 px-2 py-1 rounded text-xs ml-1">
                marios-authentic-italian.localhost:3000
              </code>
            </p>
            <Link
              href="/restaurants"
              className="text-blue-600 hover:text-blue-500 text-sm font-medium"
            >
              Use the Restaurant Finder to discover all available subdomains →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
