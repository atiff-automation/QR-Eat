import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Users, BarChart3, Smartphone } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="mr-3 relative w-10 h-10">
                <Image
                  src="/icons/icon-192x192.png"
                  alt="Tabtep Logo"
                  fill
                  className="object-cover rounded-lg"
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

      <div className="max-w-7xl mx-auto px-4 py-20">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-8 tracking-tight">
            Tabtep
          </h1>
          <p className="text-2xl md:text-3xl text-gray-600 mb-10 max-w-2xl mx-auto font-light leading-relaxed">
            The all-in-one operating system for modern restaurants.
            <span className="block text-blue-600 font-normal mt-2">
              QR Ordering. POS. KDS.
            </span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/login">
              <Button
                size="lg"
                className="w-full sm:w-auto px-8 py-6 text-lg rounded-full shadow-lg hover:shadow-xl transition-all"
              >
                Get Started
              </Button>
            </Link>
            <Link href="/restaurants">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto px-8 py-6 text-lg rounded-full border-2"
              >
                Find Restaurant
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid - Simplified */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="p-8 bg-white/60 backdrop-blur-sm rounded-2xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
            <Smartphone className="h-10 w-10 text-blue-600 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Contactless Ordering
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Seamless QR code ordering for your customers. No app download
              required.
            </p>
          </div>

          <div className="p-8 bg-white/60 backdrop-blur-sm rounded-2xl border border-purple-100 shadow-sm hover:shadow-md transition-shadow">
            <BarChart3 className="h-10 w-10 text-purple-600 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Real-time Insights
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Powerful analytics to track sales, popular items, and staff
              performance.
            </p>
          </div>

          <div className="p-8 bg-white/60 backdrop-blur-sm rounded-2xl border border-green-100 shadow-sm hover:shadow-md transition-shadow">
            <Users className="h-10 w-10 text-green-600 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Team Management
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Role-based access for owners, managers, and kitchen staff.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
