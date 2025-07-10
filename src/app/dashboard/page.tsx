'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Staff {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: {
    id: string;
    name: string;
    description: string;
    permissions: Record<string, string[]>;
  };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
  };
  lastLoginAt?: string;
}

export default function DashboardPage() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      if (response.ok) {
        setStaff(data.staff);
      } else {
        setError(data.error || 'Failed to fetch user data');
        if (response.status === 401) {
          router.push('/login');
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">No user data available</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">
              {staff.restaurant.name} - Dashboard
            </h1>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* User Info Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Profile Information
                </h3>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="text-sm text-gray-900">
                      {staff.firstName} {staff.lastName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="text-sm text-gray-900">{staff.email}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      Username
                    </dt>
                    <dd className="text-sm text-gray-900">{staff.username}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Role</dt>
                    <dd className="text-sm text-gray-900">{staff.role.name}</dd>
                  </div>
                  {staff.phone && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Phone
                      </dt>
                      <dd className="text-sm text-gray-900">{staff.phone}</dd>
                    </div>
                  )}
                  {staff.lastLoginAt && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Last Login
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {new Date(staff.lastLoginAt).toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {/* Permissions Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Permissions
                </h3>
                <div className="space-y-2">
                  {Object.entries(staff.role.permissions).map(
                    ([resource, actions]) => (
                      <div key={resource}>
                        <dt className="text-sm font-medium text-gray-500 capitalize">
                          {resource}
                        </dt>
                        <dd className="text-sm text-gray-900">
                          {(actions as string[]).join(', ')}
                        </dd>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                    View Orders
                  </button>
                  <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                    Manage Menu
                  </button>
                  <button className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                    View Tables
                  </button>
                  <button className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                    Reports
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="mt-8 bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                System Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">✓</div>
                  <div className="text-sm text-gray-500">Database</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">✓</div>
                  <div className="text-sm text-gray-500">Authentication</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">⚠</div>
                  <div className="text-sm text-gray-500">Redis (Pending)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
