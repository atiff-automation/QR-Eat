'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, LogOut } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AUTH_ROUTES } from '@/lib/auth-routes';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userInfo, setUserInfo] = useState<{
    firstName: string;
    lastName: string;
    email: string;
  } | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated and needs to change password
    const checkAuth = async () => {
      try {
        const data = await ApiClient.get<{
          user: {
            userType: string;
            firstName: string;
            lastName: string;
            email: string;
            mustChangePassword?: boolean;
          };
        }>('/auth/me');

        // Only staff and restaurant owners with mustChangePassword should be on this page
        if (
          data.user.userType !== 'staff' &&
          data.user.userType !== 'restaurant_owner'
        ) {
          router.push('/dashboard');
          return;
        }

        // If user doesn't need to change password, redirect appropriately
        if (!data.user.mustChangePassword) {
          if (data.user.userType === 'restaurant_owner') {
            router.push('/owner/dashboard');
          } else if (data.user.userType === 'staff') {
            router.push('/dashboard/kitchen');
          } else {
            router.push('/dashboard');
          }
          return;
        }

        setUserInfo({
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          email: data.user.email,
        });
      } catch (error) {
        console.error('Auth check failed:', error);
        router.push(AUTH_ROUTES.LOGIN);
      }
    };

    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
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
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different');
      return;
    }

    setIsLoading(true);

    try {
      await ApiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      setSuccess('Password changed! Logging out...');

      // Log out user after 2 seconds
      setTimeout(async () => {
        await ApiClient.post('/auth/logout');
        router.push(AUTH_ROUTES.LOGIN);
      }, 2000);
    } catch (error) {
      console.error('Failed to change password:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Failed to change password'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await ApiClient.post('/auth/logout');
      router.push(AUTH_ROUTES.LOGIN);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!userInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Change Password</h2>
          <p className="mt-2 text-sm text-gray-600">
            Welcome, {userInfo.firstName}
          </p>
        </div>

        {/* Simple Notice */}
        <div className="bg-blue-50 rounded-lg p-3 mb-6">
          <p className="text-xs text-blue-800 text-center">
            Please set a new password to continue
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-800 text-center">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 rounded-lg p-3 mb-4">
            <p className="text-sm text-green-800 text-center">{success}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">At least 8 characters</p>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-all"
            >
              {isLoading ? 'Changing...' : 'Change Password'}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-3 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-all flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
