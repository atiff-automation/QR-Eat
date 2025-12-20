'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  getClientSubdomainAuthContext,
  getLoginFormConfig,
  createSubdomainLoginPayload,
  handlePostLoginRedirect,
} from '@/lib/subdomain-auth';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { LoginResponse } from '@/lib/rbac/types';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Subdomain and redirect handling
  const [redirectTo, setRedirectTo] = useState('/dashboard');
  const [authContext, setAuthContext] = useState(
    getClientSubdomainAuthContext()
  );
  const [formConfig, setFormConfig] = useState(getLoginFormConfig(authContext));
  const searchParams = useSearchParams();

  useEffect(() => {
    // Update context when component mounts
    const context = getClientSubdomainAuthContext();
    setAuthContext(context);
    setFormConfig(getLoginFormConfig(context));

    // Handle redirect parameter
    const redirect = searchParams.get('redirect');

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlRedirect = urlParams.get('redirect');

      const finalRedirect = redirect || urlRedirect;
      if (finalRedirect) {
        setRedirectTo(finalRedirect);
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const payload = createSubdomainLoginPayload(email, password, authContext);

      const data = await ApiClient.post<LoginResponse>(
        '/auth/rbac-login',
        payload
      );

      console.log('🎯 Login response received:', data);
      console.log('🍪 Cookies after login:', document.cookie);

      // ✅ Initialize automatic token refresh system
      ApiClient.setTokenExpiration(data.tokenExpiration.accessToken);

      // Handle redirect with subdomain awareness
      const finalRedirect = handlePostLoginRedirect(
        authContext,
        data,
        redirectTo
      );

      // Use Next.js router for better cookie handling
      console.log('🔄 Redirecting to:', finalRedirect);

      // Add a small delay to ensure cookies are properly set before redirect
      setTimeout(() => {
        // Force a refresh to ensure middleware recognizes the new cookie
        window.location.replace(finalRedirect);
      }, 150);
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const quickLogin = (optionId: string) => {
    const option = formConfig.quickLoginOptions.find(
      (opt) => opt.id === optionId
    );
    if (option) {
      setEmail(option.email);
      setPassword(option.password);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {formConfig.title}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {formConfig.subtitle}
          </p>
          {authContext.isSubdomain && authContext.restaurantSlug && (
            <p className="mt-1 text-center text-xs text-blue-600">
              Accessing: {authContext.restaurantSlug}
            </p>
          )}
          {redirectTo !== '/dashboard' && (
            <p className="mt-1 text-center text-xs text-blue-600">
              Will redirect to: {redirectTo}
            </p>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Forgot your password?
            </Link>
          </div>

          {formConfig.showQuickLogin && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-50 text-gray-500">
                    Quick Login
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {formConfig.quickLoginOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => quickLogin(option.id)}
                    className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 text-sm text-gray-600">
                <p className="font-medium">Test Credentials:</p>
                {authContext.isSubdomain ? (
                  <p>• Staff: */staff123</p>
                ) : (
                  <>
                    <p>• Platform Admin: admin@qrorder.com / admin123</p>
                    <p>• Restaurant Owners: */owner123</p>
                    <p>• Staff: */staff123</p>
                  </>
                )}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
