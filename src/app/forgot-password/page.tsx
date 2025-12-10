'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [userType, setUserType] = useState<'staff' | 'restaurant_owner'>('staff');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetInfo, setResetInfo] = useState<{ token?: string; resetUrl?: string } | null>(null);
  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const data = await ApiClient.post<{
        message: string;
        resetToken?: string;
        resetUrl?: string;
      }>('/auth/reset-password', { email, userType });

      setMessage(data.message);
      if (data.resetToken) {
        setResetInfo({ token: data.resetToken, resetUrl: data.resetUrl });
      }
    } catch (error) {
      console.error('Password reset request error:', error);
      setError(error instanceof ApiClientError ? error.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Password Reset Options
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Choose the best option for your account type
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">For Staff Members:</h3>
            <p className="text-sm text-blue-700 mb-3">
              Restaurant staff should request password help from their manager instead of self-service reset.
            </p>
            <Link
              href="/staff-password-help"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Users className="h-4 w-4 mr-2" />
              Get Password Help from Manager
            </Link>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">OR</span>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">For Restaurant Owners:</h3>
            <p className="text-sm text-gray-600 mb-3">
              Restaurant owners can use self-service password reset.
            </p>
          </div>
        </div>

        {!message && (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="userType" className="block text-sm font-medium text-gray-700">
                  Account Type
                </label>
                <select
                  id="userType"
                  value={userType}
                  onChange={(e) => setUserType(e.target.value as 'staff' | 'restaurant_owner')}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="staff">Staff Member</option>
                  <option value="restaurant_owner">Restaurant Owner</option>
                </select>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>

            <div className="text-center">
              <Link 
                href="/login" 
                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Login
              </Link>
            </div>
          </form>
        )}

        {message && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
              {message}
            </div>

            {resetInfo && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md text-sm">
                <p className="font-medium mb-2">Development Mode - Reset Information:</p>
                <p className="mb-2"><strong>Token:</strong> {resetInfo.token}</p>
                <Link 
                  href={resetInfo.resetUrl || '#'}
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Click here to reset password
                </Link>
              </div>
            )}

            <div className="text-center">
              <button
                onClick={() => {
                  setMessage('');
                  setResetInfo(null);
                  setEmail('');
                }}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Send another reset link
              </button>
            </div>

            <div className="text-center">
              <Link 
                href="/login" 
                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}