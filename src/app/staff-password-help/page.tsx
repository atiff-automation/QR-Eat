'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, AlertCircle } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

export default function StaffPasswordHelpPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const data = await ApiClient.post<{ message: string }>('/auth/staff-password-request', {
        email
      });

      setMessage(data.message);
    } catch (error) {
      console.error('Password help request error:', error);
      setError(error instanceof ApiClientError ? error.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Users className="mx-auto h-12 w-12 text-blue-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Staff Password Help
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Request password assistance from your restaurant manager
          </p>
        </div>

        {!message && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5 mr-3" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">How this works:</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-600">
                    <li>Enter your staff email address</li>
                    <li>Your restaurant owner will be notified</li>
                    <li>They can reset your password from their dashboard</li>
                    <li>Ask your manager for the new password</li>
                  </ul>
                </div>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Your Staff Email Address
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
                  placeholder="Enter your work email"
                />
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
                  {loading ? 'Requesting Help...' : 'Request Password Help'}
                </button>
              </div>
            </form>
          </div>
        )}

        {message && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm">
              <p className="font-medium mb-2">Request Sent Successfully!</p>
              <p>{message}</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md text-sm">
              <p className="font-medium mb-1">Next Steps:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Contact your restaurant manager</li>
                <li>They will reset your password from their dashboard</li>
                <li>They'll provide you with a new temporary password</li>
                <li>You'll be asked to change it when you login</li>
              </ul>
            </div>

            <div className="text-center">
              <button
                onClick={() => {
                  setMessage('');
                  setEmail('');
                }}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Request help for another staff member
              </button>
            </div>
          </div>
        )}

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
    </div>
  );
}