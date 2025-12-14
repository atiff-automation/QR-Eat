'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AUTH_ROUTES } from '@/lib/auth-routes';

function ResetPasswordForm() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const validatePassword = (password: string) => {
    const errors = [];
    if (password.length < 6) {
      errors.push('At least 6 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('One uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('One lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('One number');
    }
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (!token) {
      setError('Invalid reset token. Please request a new password reset.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      setError(`Password must contain: ${passwordErrors.join(', ')}`);
      setLoading(false);
      return;
    }

    try {
      const data = await ApiClient.patch<{ message: string }>(
        '/auth/reset-password',
        {
          token,
          newPassword: password,
        }
      );

      setMessage(data.message);
      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push(AUTH_ROUTES.LOGIN);
      }, 3000);
    } catch (error) {
      console.error('Password reset error:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const passwordErrors = password ? validatePassword(password) : [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Set New Password
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Create a strong password for your account
          </p>
        </div>

        {!success && (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="token"
                  className="block text-sm font-medium text-gray-700"
                >
                  Reset Token
                </label>
                <input
                  id="token"
                  name="token"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter reset token"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  New Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>

                {password && (
                  <div className="mt-2 text-sm">
                    <p className="text-gray-600 mb-1">Password requirements:</p>
                    <ul className="space-y-1">
                      <li
                        className={`flex items-center ${password.length >= 6 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        <span className="mr-2">
                          {password.length >= 6 ? '✓' : '✗'}
                        </span>
                        At least 6 characters
                      </li>
                      <li
                        className={`flex items-center ${/[A-Z]/.test(password) ? 'text-green-600' : 'text-red-600'}`}
                      >
                        <span className="mr-2">
                          {/[A-Z]/.test(password) ? '✓' : '✗'}
                        </span>
                        One uppercase letter
                      </li>
                      <li
                        className={`flex items-center ${/[a-z]/.test(password) ? 'text-green-600' : 'text-red-600'}`}
                      >
                        <span className="mr-2">
                          {/[a-z]/.test(password) ? '✓' : '✗'}
                        </span>
                        One lowercase letter
                      </li>
                      <li
                        className={`flex items-center ${/[0-9]/.test(password) ? 'text-green-600' : 'text-red-600'}`}
                      >
                        <span className="mr-2">
                          {/[0-9]/.test(password) ? '✓' : '✗'}
                        </span>
                        One number
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700"
                >
                  Confirm New Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Confirm new password"
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

                {confirmPassword && password && (
                  <div className="mt-1 text-sm">
                    {password === confirmPassword ? (
                      <p className="text-green-600">✓ Passwords match</p>
                    ) : (
                      <p className="text-red-600">✗ Passwords do not match</p>
                    )}
                  </div>
                )}
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
                disabled={
                  loading ||
                  passwordErrors.length > 0 ||
                  password !== confirmPassword
                }
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </form>
        )}

        {success && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm text-center">
              <p className="font-medium">{message}</p>
              <p className="mt-2">Redirecting to login page in 3 seconds...</p>
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
